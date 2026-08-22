/**
 * Assembling the analysis facts.
 *
 * This module is the purity boundary: every file in this directory EXCEPT
 * `loader.ts` is plain data in, plain data out, with no database and no clock.
 * That is what lets the whole statistical stack be driven by synthetic
 * generators — including the null datasets that have to prove the pipeline
 * finds nothing in noise. `loader.ts` is the single impure edge, and nothing
 * pure may import it.
 *
 * The one rule that matters most here: the day grid is DENSE and contiguous.
 * A missing `daily_log` row is a day with `raIndex === null`, not a day with
 * zero. Imputing zero would read every lazily-logged day as a good day, and
 * then any food eaten on a lazily-logged day looks protective. It would also
 * break the rotation test, which needs a gapless index to rotate over.
 */
import { addDays, eachLogDate, weekdayOf, type LogDate } from '@/lib/time';
import type { OnsetLagKey, RaComponent } from '@/lib/scales';
import type { Schedule } from '@/services/medication/schedule';
import { computeDeviations, computeRaIndex } from './raIndex';
import {
  countedConfidences,
  share,
  sumMeasured,
  type MeasuredItem,
  type MeasuredPer100,
} from './exposure';
import {
  adherenceForWindow,
  DMARD_CATEGORIES,
  type AdherenceIntake,
} from './adherence';
import {
  deriveCyclePhases,
  isPerimenstrual,
  medianCycleLength,
  type MenstrualEvent,
} from './cycle';
import {
  steroidMgForDay,
  steroidStep,
  type SteroidIntake,
  type SteroidMedication,
} from './steroid';
import type {
  CyclePhase,
  SteroidStep,
  SymptomGroupKey,
  TagConfidence,
} from './types';

/* -------------------------------------------------------------------------- */
/* Input rows — exactly what src/db/queries/analysis.ts returns.              */
/* -------------------------------------------------------------------------- */

export type DailyLogRow = {
  logDate: LogDate;
  jointPain: number | null;
  morningStiffnessMinutes: number | null;
  fatigue: number | null;
  wellbeing: number | null;
  isFlare: boolean;
  sleepMinutes: number | null;
  sleepQuality: number | null;
  stress: number | null;
  activityMinutes: number | null;
  activityIntensity: number | null;
  bristolTypical: number | null;
  tenderCountDas28: number;
};

export type MealRow = {
  id: string;
  occurredAt: Date;
  logDate: LogDate;
  slot: string;
};

export type MealTagExposureRow = {
  mealId: string;
  tagId: string;
  tagKey: string;
  grams: number;
  confidence: TagConfidence;
};

export type MealMeasuredRow = {
  mealId: string;
  grams: number;
  per100: MeasuredPer100 | null;
  hasStatedAmount: boolean;
};

export type SymptomEntryRow = {
  id: string;
  mealId: string | null;
  occurredAt: Date;
  logDate: LogDate;
  severity: number;
  onsetLag: OnsetLagKey | null;
  groups: SymptomGroupKey[];
};

export type TagDefRow = {
  id: string;
  key: string;
  labelDe: string;
  isAnalysed: boolean;
  primaryWindow: OnsetLagKey | null;
  minDoseGrams: number | null;
};

export type ProtocolInterval = { startsOn: LogDate; endsOn: LogDate | null };

export type AnalysisSettings = {
  timeZone: string;
  dayStartHour: number;
  countTraceExposure: boolean;
};

export type FactsInput = {
  range: { from: LogDate; to: LogDate };
  settings: AnalysisSettings;
  dailyLogs: readonly DailyLogRow[];
  meals: readonly MealRow[];
  exposures: readonly MealTagExposureRow[];
  measured: readonly MealMeasuredRow[];
  symptoms: readonly SymptomEntryRow[];
  tagDefs: readonly TagDefRow[];
  steroidSchedules: readonly Schedule[];
  steroidMedications: ReadonlyMap<string, SteroidMedication>;
  dmardSchedules: readonly Schedule[];
  intakes: readonly {
    logDate: LogDate;
    medicationId: string;
    scheduleDoseId: string | null;
    status: 'taken' | 'skipped' | 'missed';
    doseAmount: number;
    doseUnit: string;
    category: string;
  }[];
  menstrual: readonly MenstrualEvent[];
  protocolIntervals: readonly ProtocolInterval[];
};

/* -------------------------------------------------------------------------- */
/* Output facts                                                              */
/* -------------------------------------------------------------------------- */

export type MealFact = {
  id: string;
  /** Index into DailyFact[] — the dense calendar, not "days with data". */
  dayIndex: number;
  occurredAt: Date;
  slot: string;
  gramsByTagKey: Record<string, number>;
  doseByTagKey: Record<string, number>;
  /**
   * Raw gram parts, not just the ratios. A day's share has to be
   * gram-WEIGHTED: averaging the per-meal shares would let a 10 g coffee count
   * as much as a 600 g dinner, which is exactly the kind of quiet arithmetic
   * error that makes a coverage gate useless.
   */
  totalGrams: number;
  blsGrams: number;
  statedGrams: number;
  blsGramsShare: number;
  portionEvidenceShare: number;
  /** Whether any symptom entry explicitly names this meal. Bias diagnostic. */
  hasExplicitReaction: boolean;
};

export type SymptomFact = {
  occurredAt: Date;
  severity: number;
  groups: SymptomGroupKey[];
  /** Display and bias diagnostics ONLY — never an outcome. */
  explicitMealId: string | null;
  /** Her own asserted lag, used only to measure agreement with the clock. */
  assertedLag: OnsetLagKey | null;
};

export type DailyFact = {
  logDate: LogDate;
  raIndex: number | null;
  raComponents: Partial<Record<RaComponent, number>>;
  deviation: number | null;
  isFlare: boolean;

  hasDailyLog: boolean;
  hasMeal: boolean;
  hasSymptom: boolean;
  isTracked: boolean;
  inProtocol: boolean;

  gramsByTagKey: Record<string, number>;
  doseByTagKey: Record<string, number>;
  blsGramsShare: number;
  portionEvidenceShare: number;

  sleepMinutes: number | null;
  sleepQuality: number | null;
  stress: number | null;
  activityMinutes: number | null;
  activityIntensity: number | null;

  steroidMgPredEq: number | null;
  steroidStep: SteroidStep;
  cyclePhase: CyclePhase;
  cycleDay: number | null;
  perimenstrual: boolean | null;
  dmardAdherence7d: number | null;

  weekday: number;
};

export type Facts = {
  days: DailyFact[];
  meals: MealFact[];
  symptoms: SymptomFact[];
  /** Analysed tag definitions, keyed by tag key. */
  tagDefs: Map<string, TagDefRow>;
  steroidFactorAssumed: boolean;
  cycleLength: number;
  counts: {
    rangeDays: number;
    trackedDays: number;
    daysWithRaIndex: number;
    daysWithOutcome: number;
    meals: number;
    symptomEntries: number;
    blsGramsShare: number;
    portionEvidenceShare: number;
  };
};

/** `isTracked`: a day we can honestly treat as observed. */
export const TRACKED_DAY_RULE = 'hasMeal && (hasDailyLog || hasSymptom)';

export function assembleFacts(input: FactsInput): Facts {
  const days = eachLogDate(input.range.from, input.range.to);
  const dayIndex = new Map<LogDate, number>();
  days.forEach((day, index) => dayIndex.set(day, index));

  const logByDate = new Map(input.dailyLogs.map((row) => [row.logDate, row]));
  const analysedTags = new Map(
    input.tagDefs.filter((t) => t.isAnalysed).map((t) => [t.key, t])
  );

  const counted = new Set<TagConfidence>(
    countedConfidences(input.settings.countTraceExposure)
  );

  /* --- meals ------------------------------------------------------------- */

  const explicitlyLinked = new Set(
    input.symptoms
      .map((s) => s.mealId)
      .filter((id): id is string => id !== null)
  );

  const gramsByMeal = new Map<string, Record<string, number>>();
  for (const row of input.exposures) {
    if (!analysedTags.has(row.tagKey)) continue;
    if (!counted.has(row.confidence)) continue;
    const bucket = gramsByMeal.get(row.mealId) ?? {};
    bucket[row.tagKey] = (bucket[row.tagKey] ?? 0) + row.grams;
    gramsByMeal.set(row.mealId, bucket);
  }

  const measuredByMeal = new Map<string, MeasuredItem[]>();
  for (const row of input.measured) {
    const list = measuredByMeal.get(row.mealId) ?? [];
    list.push({
      grams: row.grams,
      per100: row.per100,
      hasStatedAmount: row.hasStatedAmount,
    });
    measuredByMeal.set(row.mealId, list);
  }

  const meals: MealFact[] = [];
  for (const meal of input.meals) {
    const index = dayIndex.get(meal.logDate);
    if (index === undefined) continue;
    const totals = sumMeasured(measuredByMeal.get(meal.id) ?? []);
    meals.push({
      id: meal.id,
      dayIndex: index,
      occurredAt: meal.occurredAt,
      slot: meal.slot,
      gramsByTagKey: gramsByMeal.get(meal.id) ?? {},
      doseByTagKey: totals.doseByTagKey,
      totalGrams: totals.totalGrams,
      blsGrams: totals.blsGrams,
      statedGrams: totals.statedGrams,
      blsGramsShare: share(totals.blsGrams, totals.totalGrams),
      portionEvidenceShare: share(totals.statedGrams, totals.totalGrams),
      hasExplicitReaction: explicitlyLinked.has(meal.id),
    });
  }

  /* --- symptoms ---------------------------------------------------------- */

  const symptoms: SymptomFact[] = input.symptoms.map((row) => ({
    occurredAt: row.occurredAt,
    severity: row.severity,
    groups: row.groups,
    explicitMealId: row.mealId,
    assertedLag: row.onsetLag,
  }));

  /* --- per-day rollups --------------------------------------------------- */

  const mealsByDay = new Map<number, MealFact[]>();
  for (const meal of meals) {
    const list = mealsByDay.get(meal.dayIndex) ?? [];
    list.push(meal);
    mealsByDay.set(meal.dayIndex, list);
  }

  const symptomDays = new Set(input.symptoms.map((s) => s.logDate));
  const protocolDays = protocolDaySet(input.protocolIntervals, days);

  const cycles = deriveCyclePhases(input.menstrual, days);
  const cycleLength = medianCycleLength(input.menstrual);

  const steroidIntakesByDay = new Map<LogDate, SteroidIntake[]>();
  const dmardIntakes: AdherenceIntake[] = [];
  for (const intake of input.intakes) {
    if (intake.category === 'steroid') {
      const list = steroidIntakesByDay.get(intake.logDate) ?? [];
      list.push({
        medicationId: intake.medicationId,
        scheduleDoseId: intake.scheduleDoseId,
        status: intake.status,
        doseAmount: intake.doseAmount,
        doseUnit: intake.doseUnit,
      });
      steroidIntakesByDay.set(intake.logDate, list);
    }
    if ((DMARD_CATEGORIES as readonly string[]).includes(intake.category)) {
      dmardIntakes.push({
        logDate: intake.logDate,
        scheduleDoseId: intake.scheduleDoseId,
        status: intake.status,
      });
    }
  }

  let steroidFactorAssumed = false;
  let totalGramsAll = 0;
  let blsGramsAll = 0;
  let statedGramsAll = 0;

  const raValues: (number | null)[] = [];
  const partial: Omit<DailyFact, 'deviation'>[] = [];

  days.forEach((day, index) => {
    const log = logByDate.get(day) ?? null;
    const dayMeals = mealsByDay.get(index) ?? [];

    const ra = computeRaIndex({
      jointPain: log?.jointPain ?? null,
      // No daily_log row means the tender count is unknown, not zero.
      tenderCountDas28: log ? log.tenderCountDas28 : null,
      morningStiffnessMinutes: log?.morningStiffnessMinutes ?? null,
      fatigue: log?.fatigue ?? null,
      complaints: log?.wellbeing ?? null,
    });
    raValues.push(ra.value);

    const gramsByTagKey: Record<string, number> = {};
    const doseByTagKey: Record<string, number> = {};
    let dayTotal = 0;
    let dayBls = 0;
    let dayStated = 0;
    for (const meal of dayMeals) {
      for (const [key, grams] of Object.entries(meal.gramsByTagKey)) {
        gramsByTagKey[key] = (gramsByTagKey[key] ?? 0) + grams;
      }
      for (const [key, dose] of Object.entries(meal.doseByTagKey)) {
        doseByTagKey[key] = (doseByTagKey[key] ?? 0) + dose;
      }
      dayTotal += meal.totalGrams;
      dayBls += meal.blsGrams;
      dayStated += meal.statedGrams;
    }
    const blsGramsShare = share(dayBls, dayTotal);
    const portionEvidenceShare = share(dayStated, dayTotal);
    totalGramsAll += dayTotal;
    blsGramsAll += dayBls;
    statedGramsAll += dayStated;

    const steroid = steroidMgForDay(
      input.steroidSchedules as Schedule[],
      input.steroidMedications,
      steroidIntakesByDay.get(day) ?? [],
      day
    );
    if (steroid.factorAssumed) steroidFactorAssumed = true;
    const hasSteroidPlan =
      input.steroidSchedules.length > 0 ||
      (steroidIntakesByDay.get(day) ?? []).length > 0;
    const steroidMg = hasSteroidPlan ? steroid.mg : null;

    const hasDailyLog = log !== null;
    const hasMeal = dayMeals.length > 0;
    const hasSymptom = symptomDays.has(day);

    partial.push({
      logDate: day,
      raIndex: ra.value,
      raComponents: ra.components,
      isFlare: log?.isFlare ?? false,
      hasDailyLog,
      hasMeal,
      hasSymptom,
      isTracked: hasMeal && (hasDailyLog || hasSymptom),
      inProtocol: protocolDays.has(day),
      gramsByTagKey,
      doseByTagKey,
      blsGramsShare,
      portionEvidenceShare,
      sleepMinutes: log?.sleepMinutes ?? null,
      sleepQuality: log?.sleepQuality ?? null,
      stress: log?.stress ?? null,
      activityMinutes: log?.activityMinutes ?? null,
      activityIntensity: log?.activityIntensity ?? null,
      steroidMgPredEq: steroidMg,
      steroidStep: steroidStep(steroidMg),
      cyclePhase: cycles[index].phase,
      cycleDay: cycles[index].cycleDay,
      perimenstrual: isPerimenstrual(cycles[index], cycleLength),
      dmardAdherence7d: adherenceForWindow(
        input.dmardSchedules as Schedule[],
        dmardIntakes,
        day
      ),
      weekday: weekdayOf(day),
    });
  });

  const deviations = computeDeviations(raValues);
  const daysOut: DailyFact[] = partial.map((day, index) => ({
    ...day,
    deviation: deviations[index],
  }));

  return {
    days: daysOut,
    meals,
    symptoms,
    tagDefs: analysedTags,
    steroidFactorAssumed,
    cycleLength,
    counts: {
      rangeDays: days.length,
      trackedDays: daysOut.filter((d) => d.isTracked).length,
      daysWithRaIndex: daysOut.filter((d) => d.raIndex !== null).length,
      daysWithOutcome: daysOut.filter((d) => d.deviation !== null).length,
      meals: meals.length,
      symptomEntries: symptoms.length,
      blsGramsShare: share(blsGramsAll, totalGramsAll),
      portionEvidenceShare: share(statedGramsAll, totalGramsAll),
    },
  };
}

function protocolDaySet(
  intervals: readonly ProtocolInterval[],
  days: readonly LogDate[]
): Set<LogDate> {
  const out = new Set<LogDate>();
  if (intervals.length === 0 || days.length === 0) return out;
  const last = days[days.length - 1];
  for (const interval of intervals) {
    let cursor = interval.startsOn;
    const end = interval.endsOn ?? last;
    // Bounded by the range, so an open-ended protocol cannot spin forever.
    for (let guard = 0; guard <= days.length; guard++) {
      if (cursor > end) break;
      out.add(cursor);
      cursor = addDays(cursor, 1);
    }
  }
  return out;
}
