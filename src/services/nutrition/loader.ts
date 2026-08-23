import { NUTRIENT_META, type NutrientKey } from '@/lib/nutrients';
import {
  addDays,
  eachLogDate,
  todayLogDate,
  type LogDate,
} from '@/lib/time';
import { getUserSettings } from '@/db/queries/users';
import { intakeRange, scheduleVersionsRange } from '@/db/queries/analysis';
import {
  flareDays,
  medicationNutrientRows,
  nutrientItemRange,
  nutritionProfileVersions,
  targetOverrideRows,
  weightRange,
} from '@/db/queries/nutrition';
import {
  steroidMgForDay,
  type SteroidMedication,
} from '@/services/analysis/steroid';
import type { Schedule } from '@/services/medication/schedule';
import { emptyDayNutrients, sumDayNutrients } from './aggregate';
import { NUTRITION_GOOD_DAY, nutritionDay } from './score';
import { computeNutritionStreak, type NutritionStreakResult } from './streak';
import {
  nutritionWindow,
  weeklyComparables,
  type NutritionSummary,
} from './period';
import { supplementContributions } from './supplements';
import {
  deriveTargets,
  overridesForDay,
  profileForDay,
  targetContext,
  type ProfileVersion,
} from './targets/derive';
import { ageFromBirthYear, referenceWeightSeries } from './targets/formulas';
import type { TargetValue } from './targets/types';
import type { DayNutrients, NutritionDay } from './types';

/**
 * The one impure file in this service — same convention as
 * `services/progress/loader.ts`. Everything it calls is a pure function or a
 * query; nothing below this line reads the database.
 */

/** How far back the nutrient read goes. */
export const NUTRITION_WINDOW_DAYS = 90;
/** The rolling quotient shown next to the run. */
export const NUTRITION_QUOTIENT_DAYS = 14;

/**
 * Days of prednisolone equivalent that make the ACR GIOP targets apply.
 *
 * >= 2.5 mg on at least 60 of the last 90 days. Derived rather than asked: the
 * app already knows, and a question it can answer itself is a question it
 * should not ask.
 */
export const STEROID_LONG_TERM_MIN_MG = 2.5;
export const STEROID_LONG_TERM_MIN_DAYS = 60;
export const STEROID_LOOKBACK_DAYS = 90;

/**
 * Weight lookback for the 28-day reference median.
 *
 * Wider than the window itself, so the first day of the range already has a
 * median behind it instead of starting from nothing.
 */
const WEIGHT_LOOKBACK_DAYS = 28;

export type NutritionData = {
  today: LogDate;
  from: LogDate;
  to: LogDate;
  /** Null until the questionnaire has been started. */
  targets: Map<NutrientKey, TargetValue> | null;
  /** Why there are no targets, for the empty state. */
  blocked: 'kein_profil' | null;
  days: NutritionDay[];
  raw: DayNutrients[];
  today_: NutritionDay | null;
  streak: NutritionStreakResult;
  summary: NutritionSummary;
  /** The rolling quotient over the last fortnight. */
  recent: NutritionSummary;
  /** The body weight the weight-scaled targets used, for the explanation text. */
  weightKg: number | null;
  steroidLongTerm: boolean;
};

export type LoadNutritionOptions = {
  from?: LogDate;
  to?: LogDate;
  days?: number;
  now?: Date;
};

export async function loadNutrition(
  userId: string,
  options: LoadNutritionOptions = {}
): Promise<NutritionData> {
  const settings = await getUserSettings(userId);
  const today =
    options.to ??
    todayLogDate(settings.timeZone, settings.dayStartHour, options.now ?? new Date());
  const to = today;
  const from =
    options.from ?? addDays(to, -((options.days ?? NUTRITION_WINDOW_DAYS) - 1));

  const [
    profiles,
    overrides,
    mapping,
    items,
    weights,
    flares,
    intakes,
    steroidSchedules,
  ] = await Promise.all([
    nutritionProfileVersions(userId),
    targetOverrideRows(userId),
    medicationNutrientRows(userId),
    nutrientItemRange(userId, from, to),
    weightRange(userId, addDays(from, -WEIGHT_LOOKBACK_DAYS), to),
    flareDays(userId, from, to),
    intakeRange(userId, from, to),
    scheduleVersionsRange(
      userId,
      addDays(to, -(STEROID_LOOKBACK_DAYS - 1)),
      to,
      ['steroid']
    ),
  ]);

  const calendar = eachLogDate(from, to);

  const blocked: NutritionData['blocked'] =
    profiles.length === 0 ? 'kein_profil' : null;

  const supplements = supplementContributions(
    intakes,
    mapping.map((row) => ({
      medicationId: row.medicationId,
      nutrientKey: row.nutrientKey as NutrientKey,
      amountPerPiece: row.amountPerPiece,
      unit: row.unit,
    }))
  );

  const itemsByDay = new Map<LogDate, typeof items>();
  for (const item of items) {
    const list = itemsByDay.get(item.logDate);
    if (list) list.push(item);
    else itemsByDay.set(item.logDate, [item]);
  }

  const raw = calendar.map((logDate) =>
    itemsByDay.has(logDate)
      ? sumDayNutrients(logDate, itemsByDay.get(logDate) as typeof items, supplements)
      : withSupplementsOnly(logDate, supplements)
  );

  const weightByDay = weightSeriesForCalendar(calendar, weights);
  const steroidLongTerm = isSteroidLongTerm(
    steroidSchedules,
    intakes,
    to
  );

  // The targets on the LAST day of the range are the ones the screens show.
  const targets = blocked === null ? targetsForDay(
    profiles,
    overrides,
    to,
    weightByDay.get(to) ?? null,
    steroidLongTerm
  ) : null;

  const days: NutritionDay[] = [];
  if (targets) {
    const comparables = weeklyComparables(raw, targets);
    raw.forEach((day, index) => {
      // Targets are re-derived per day, because the profile is versioned: a
      // renal cap set in June must not turn every day of May into a breach.
      const dayTargets = targetsForDay(
        profiles,
        overrides,
        day.logDate,
        weightByDay.get(day.logDate) ?? null,
        steroidLongTerm
      );
      days.push(
        nutritionDay(day, dayTargets, {
          isFlare: flares.has(day.logDate),
          comparable: comparables[index],
        })
      );
    });
  }

  const streak = computeNutritionStreak(days, from, to);
  const recentDays = days.slice(-NUTRITION_QUOTIENT_DAYS);

  return {
    today,
    from,
    to,
    targets,
    blocked,
    days,
    raw,
    today_: days.length > 0 ? (days[days.length - 1] ?? null) : null,
    streak,
    summary: nutritionWindow(days),
    recent: nutritionWindow(recentDays),
    weightKg: weightByDay.get(to) ?? null,
    steroidLongTerm,
  };
}

export type TargetSet = {
  today: LogDate;
  targets: Map<NutrientKey, TargetValue>;
  blocked: NutritionData['blocked'];
  weightKg: number | null;
  weightFromDailyLog: number | null;
  steroidLongTerm: boolean;
  profile: ProfileVersion | null;
  overriddenKeys: NutrientKey[];
};

/**
 * Just the targets, for the settings screens.
 *
 * Separate from `loadNutrition` because the goal list needs no intake at all —
 * reading ninety days of meal items to render a table of reference values would
 * be the most expensive read in the app for the least reason.
 */
export async function loadTargets(
  userId: string,
  options: { now?: Date } = {}
): Promise<TargetSet> {
  const settings = await getUserSettings(userId);
  const today = todayLogDate(
    settings.timeZone,
    settings.dayStartHour,
    options.now ?? new Date()
  );

  const [profiles, overrides, weights, intakes, steroidSchedules] =
    await Promise.all([
      nutritionProfileVersions(userId),
      targetOverrideRows(userId),
      weightRange(userId, addDays(today, -WEIGHT_LOOKBACK_DAYS), today),
      intakeRange(userId, addDays(today, -(STEROID_LOOKBACK_DAYS - 1)), today),
      scheduleVersionsRange(
        userId,
        addDays(today, -(STEROID_LOOKBACK_DAYS - 1)),
        today,
        ['steroid']
      ),
    ]);

  const blocked: NutritionData['blocked'] =
    profiles.length === 0 ? 'kein_profil' : null;

  const weightByDay = weightSeriesForCalendar([today], weights);
  const weightFromDailyLog = weightByDay.get(today) ?? null;
  const steroidLongTerm = isSteroidLongTerm(steroidSchedules, intakes, today);
  const profile = profileForDay(profiles, today);

  return {
    today,
    targets: targetsForDay(
      profiles,
      overrides,
      today,
      weightFromDailyLog,
      steroidLongTerm
    ),
    blocked,
    weightKg:
      profile?.weightSource === 'manual'
        ? (profile.referenceWeightKg ?? null)
        : (weightFromDailyLog ?? profile?.referenceWeightKg ?? null),
    weightFromDailyLog,
    steroidLongTerm,
    profile,
    overriddenKeys: overridesForDay(overrides, today)
      .filter((row) => !row.disabled)
      .map((row) => row.nutrientKey),
  };
}

function withSupplementsOnly(
  logDate: LogDate,
  supplements: ReturnType<typeof supplementContributions>
): DayNutrients {
  const day = emptyDayNutrients(logDate);
  for (const contribution of supplements) {
    if (contribution.logDate !== logDate) continue;
    const total = day.totals[contribution.nutrientKey];
    total.fromSupplement += contribution.amount;
    total.total = total.fromSupplement;
  }
  return day;
}

function targetsForDay(
  profiles: readonly ProfileVersion[],
  overrides: Awaited<ReturnType<typeof targetOverrideRows>>,
  logDate: LogDate,
  weightKg: number | null,
  steroidLongTerm: boolean
): Map<NutrientKey, TargetValue> {
  const profile = profileForDay(profiles, logDate);
  if (!profile) return new Map();

  const resolvedWeight =
    profile.weightSource === 'manual'
      ? profile.referenceWeightKg
      : (weightKg ?? profile.referenceWeightKg);

  const ctx = targetContext({
    referenceSex: profile.referenceSex,
    ageYears: ageFromBirthYear(profile.birthYear, logDate),
    heightCm: profile.heightCm,
    weightKg: resolvedWeight,
    activityLevel: profile.activityLevel,
    goal: profile.goal,
    hasSarcopenia: profile.hasSarcopenia,
    menopauseStage: profile.menopauseStage,
    dietForm: profile.dietForm,
    renalImpairment: profile.renalImpairment,
    proteinMaxGPerKg: profile.proteinMaxGPerKg,
    steroidLongTerm,
  });

  return deriveTargets(
    ctx,
    overridesForDay(overrides, logDate).map((row) => ({
      nutrientKey: row.nutrientKey,
      min: row.min,
      max: row.max,
      unit: row.unit,
      disabled: row.disabled,
      reason: row.reason,
    }))
  );
}

/** The 28-day reference weight for every day of the calendar. */
function weightSeriesForCalendar(
  calendar: readonly LogDate[],
  weights: readonly { logDate: LogDate; weightKg: number }[]
): Map<LogDate, number> {
  if (calendar.length === 0) return new Map();
  const byDate = new Map(weights.map((row) => [row.logDate, row.weightKg]));
  const start = addDays(calendar[0], -WEIGHT_LOOKBACK_DAYS);
  const dense = eachLogDate(start, calendar[calendar.length - 1]);
  const series = referenceWeightSeries(
    dense.map((logDate) => byDate.get(logDate) ?? null),
    WEIGHT_LOOKBACK_DAYS
  );

  const out = new Map<LogDate, number>();
  dense.forEach((logDate, index) => {
    const value = series[index];
    if (value !== null) out.set(logDate, value);
  });
  return out;
}

/**
 * ACR GIOP long-term steroid use, derived rather than asked.
 *
 * Uses the same `steroidMgForDay` the analysis uses, so the two cannot disagree
 * about what a cortisone day is.
 */
function isSteroidLongTerm(
  schedules: Awaited<ReturnType<typeof scheduleVersionsRange>>,
  intakes: Awaited<ReturnType<typeof intakeRange>>,
  to: LogDate
): boolean {
  if (schedules.length === 0) return false;

  const medications = new Map<string, SteroidMedication>();
  for (const schedule of schedules) {
    medications.set(schedule.medicationId, {
      id: schedule.medicationId,
      name: schedule.medicationName,
      activeSubstance: schedule.activeSubstance,
    });
  }

  const intakesByDay = new Map<LogDate, typeof intakes>();
  for (const intake of intakes) {
    if (!medications.has(intake.medicationId)) continue;
    const list = intakesByDay.get(intake.logDate as LogDate);
    if (list) list.push(intake);
    else intakesByDay.set(intake.logDate as LogDate, [intake]);
  }

  let days = 0;
  for (const logDate of eachLogDate(
    addDays(to, -(STEROID_LOOKBACK_DAYS - 1)),
    to
  )) {
    const result = steroidMgForDay(
      schedules as unknown as Schedule[],
      medications,
      (intakesByDay.get(logDate) ?? []).map((intake) => ({
        medicationId: intake.medicationId,
        scheduleDoseId: intake.scheduleDoseId,
        status: intake.status,
        doseAmount: intake.doseAmount,
        doseUnit: intake.doseUnit,
      })),
      logDate
    );
    if (result.mg >= STEROID_LONG_TERM_MIN_MG) days++;
  }
  return days >= STEROID_LONG_TERM_MIN_DAYS;
}

/**
 * What the nutrient milestones need, extracted from a loaded window.
 *
 * Bounded by the same window as everything else here, so on a long history the
 * "thirtieth defensible day" is the thirtieth within the window rather than
 * ever. `ra_index_45` already works that way for the same reason, and
 * `achievement` freezes the date the first time it appears.
 */
export function nutritionMilestoneInput(data: NutritionData): {
  active: boolean;
  assessableDays: LogDate[];
  goodDays: LogDate[];
} {
  const assessable = data.days.filter((day) => !day.isFlare && day.score !== null);
  return {
    active: data.blocked === null,
    assessableDays: assessable.map((day) => day.logDate),
    goodDays: assessable
      .filter((day) => (day.score as number) >= NUTRITION_GOOD_DAY)
      .map((day) => day.logDate),
  };
}

/** Nutrients to show on the day screen, in priority order. */
export const DAY_PRIORITY: NutrientKey[] = [
  'protein',
  'fiber',
  'calcium',
  'epaDha',
];

export { NUTRIENT_META };
