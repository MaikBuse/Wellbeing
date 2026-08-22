/**
 * Range queries for the analysis.
 *
 * Until now nothing in this app looked at more than one day: every function in
 * `day.ts` takes a single `logDate`. These are the multi-day reads, and they all
 * lean on indexes that already exist — `meal_user_day_idx`,
 * `symptom_user_day_idx`, `daily_log_user_date_uq`, `intake_user_day_idx` — so
 * no migration is needed.
 *
 * Scoping, and this is the one thing not to get wrong: since the food library
 * became shared, `food` carries only `created_by_user_id` and NOTHING may
 * filter on it. Every query here is scoped through the row that owns a
 * `log_date` — `meal`, `symptom_entry`, `daily_log`, `medication` — and never
 * through the food.
 */
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '../index';
import {
  analysisRuns,
  dailyLogJoints,
  dailyLogs,
  eliminationPhases,
  eliminationProtocols,
  foodCatalog,
  foodTagDefs,
  foodTags,
  foods,
  joints,
  mealItems,
  meals,
  medicationScheduleDoses,
  medicationSchedules,
  medications,
  medicationIntakes,
  menstrualEvents,
  symptomEntries,
  symptomEntrySymptoms,
  symptomTypes,
} from '../schema';
import { addDays, type LogDate } from '@/lib/time';
import type {
  DailyLogRow,
  MealMeasuredRow,
  MealRow,
  MealTagExposureRow,
  ProtocolInterval,
  SymptomEntryRow,
  TagDefRow,
} from '@/services/analysis/facts';
import type { MenstrualEvent } from '@/services/analysis/cycle';
import type { Schedule } from '@/services/medication/schedule';
import type { OnsetLagKey, SymptomGroupKey, TagConfidence } from '@/services/analysis/types';

/** Mirrors the `med_category` enum, so `inArray` stays type-checked. */
export type MedCategory =
  | 'csdmard'
  | 'bdmard'
  | 'tsdmard'
  | 'nsaid'
  | 'steroid'
  | 'analgesic'
  | 'supplement'
  | 'other';

/**
 * One row per existing `daily_log`, with the DAS28 tender count folded in.
 *
 * The count is computed in SQL rather than by pulling the joint rows across:
 * four hundred days of joint taps is thousands of rows for a single integer per
 * day. `daily_log_joint`'s primary key covers the join.
 */
export async function dailyLogRange(
  userId: string,
  from: LogDate,
  to: LogDate
): Promise<DailyLogRow[]> {
  const rows = await db
    .select({
      logDate: dailyLogs.logDate,
      jointPain: dailyLogs.jointPain,
      morningStiffnessMinutes: dailyLogs.morningStiffnessMinutes,
      fatigue: dailyLogs.fatigue,
      wellbeing: dailyLogs.wellbeing,
      isFlare: dailyLogs.isFlare,
      sleepMinutes: dailyLogs.sleepMinutes,
      sleepQuality: dailyLogs.sleepQuality,
      stress: dailyLogs.stress,
      activityMinutes: dailyLogs.activityMinutes,
      activityIntensity: dailyLogs.activityIntensity,
      bristolTypical: dailyLogs.bristolTypical,
      tenderCountDas28:
        sql<number>`count(${dailyLogJoints.jointId}) filter (where ${joints.inDas28})::int`.as(
          'tender_count_das28'
        ),
    })
    .from(dailyLogs)
    .leftJoin(dailyLogJoints, eq(dailyLogJoints.dailyLogId, dailyLogs.id))
    .leftJoin(joints, eq(joints.id, dailyLogJoints.jointId))
    .where(
      and(
        eq(dailyLogs.userId, userId),
        gte(dailyLogs.logDate, from),
        lte(dailyLogs.logDate, to)
      )
    )
    .groupBy(dailyLogs.id)
    .orderBy(asc(dailyLogs.logDate));

  return rows;
}

/**
 * All meals in the range — including those with no tagged items.
 *
 * That inclusion is the point. A meal with nothing analysable produces no
 * exposure row at all, but it is still the cleanest possible control
 * observation for every tag. Deriving the meal list from the exposure query
 * would silently delete the unexposed arm.
 */
export async function mealRange(
  userId: string,
  from: LogDate,
  to: LogDate
): Promise<MealRow[]> {
  return db
    .select({
      id: meals.id,
      occurredAt: meals.occurredAt,
      logDate: meals.logDate,
      slot: meals.slot,
    })
    .from(meals)
    .where(
      and(eq(meals.userId, userId), gte(meals.logDate, from), lte(meals.logDate, to))
    )
    .orderBy(asc(meals.occurredAt));
}

/**
 * Grams per (meal, analysed tag).
 *
 * `food` is deliberately NOT joined: `food_tag.food_id` matches
 * `meal_item.food_id` directly, the catalogue is shared, and `meal.user_id` is
 * the only scoping boundary there is.
 */
export async function mealTagExposureRange(
  userId: string,
  from: LogDate,
  to: LogDate
): Promise<MealTagExposureRow[]> {
  const rows = await db
    .select({
      mealId: mealItems.mealId,
      tagId: foodTags.tagId,
      tagKey: foodTagDefs.key,
      confidence: foodTags.confidence,
      grams: sql<number>`sum(${mealItems.grams})::double precision`.as('grams'),
    })
    .from(mealItems)
    .innerJoin(meals, eq(meals.id, mealItems.mealId))
    .innerJoin(foodTags, eq(foodTags.foodId, mealItems.foodId))
    .innerJoin(foodTagDefs, eq(foodTagDefs.id, foodTags.tagId))
    .where(
      and(
        eq(meals.userId, userId),
        gte(meals.logDate, from),
        lte(meals.logDate, to),
        eq(foodTagDefs.isAnalysed, true)
      )
    )
    .groupBy(mealItems.mealId, foodTags.tagId, foodTagDefs.key, foodTags.confidence);

  return rows.map((row) => ({
    ...row,
    confidence: row.confidence as TagConfidence,
  }));
}

/**
 * Measured BLS values per meal item, for the descriptive dose panel.
 *
 * A LEFT join on purpose: an OFF or manual food has no `bls_catalog_id` and
 * therefore no measured values, and `null` there means "not measured" — it must
 * never be summed as zero. `hasStatedAmount` is how we know whether the grams
 * mean anything: `food_catalog` carries no portion size, so an untouched BLS
 * entry is exactly 100 g and its "dose" would just be the catalogue value.
 */
export async function mealMeasuredRange(
  userId: string,
  from: LogDate,
  to: LogDate
): Promise<MealMeasuredRow[]> {
  const rows = await db
    .select({
      mealId: mealItems.mealId,
      grams: mealItems.grams,
      quantity: mealItems.quantity,
      unit: mealItems.unit,
      portionId: mealItems.portionId,
      catalogId: foods.blsCatalogId,
      lactose: foodCatalog.lactose100,
      fructose: foodCatalog.fructose100,
      glucose: foodCatalog.glucose100,
      sorbitol: foodCatalog.sorbitol100,
      mannitol: foodCatalog.mannitol100,
      alcohol: foodCatalog.alcohol100,
      sugar: foodCatalog.sugar100,
      omega3: foodCatalog.omega3100,
      epaDha: foodCatalog.epaDha100,
      arachidonic: foodCatalog.arachidonic100,
    })
    .from(mealItems)
    .innerJoin(meals, eq(meals.id, mealItems.mealId))
    .innerJoin(foods, eq(foods.id, mealItems.foodId))
    .leftJoin(foodCatalog, eq(foodCatalog.id, foods.blsCatalogId))
    .where(
      and(eq(meals.userId, userId), gte(meals.logDate, from), lte(meals.logDate, to))
    );

  return rows.map((row) => ({
    mealId: row.mealId,
    grams: row.grams,
    per100:
      row.catalogId === null
        ? null
        : {
            lactose: row.lactose,
            fructose: row.fructose,
            glucose: row.glucose,
            sorbitol: row.sorbitol,
            mannitol: row.mannitol,
            alcohol: row.alcohol,
            sugar: row.sugar,
            omega3: row.omega3,
            epaDha: row.epaDha,
            arachidonic: row.arachidonic,
          },
    // "She said something about the amount": a named portion, a quantity other
    // than one, or a unit other than the default portion.
    hasStatedAmount:
      row.portionId !== null || Number(row.quantity) !== 1 || row.unit !== 'portion',
  }));
}

/**
 * Symptom entries, fetched ONE LOGICAL DAY WIDER than the range.
 *
 * An entry at 01:00 carries the previous logical day as its `log_date`, so its
 * `occurred_at` can sit up to `dayStartHour` hours past the end of the last day
 * in the range. Without the extra day the last day's `late`-window outcomes
 * vanish silently — which is the worst kind of bug, because the numbers still
 * look plausible.
 */
export async function symptomEntryRange(
  userId: string,
  from: LogDate,
  to: LogDate
): Promise<SymptomEntryRow[]> {
  const rows = await db
    .select({
      id: symptomEntries.id,
      mealId: symptomEntries.mealId,
      occurredAt: symptomEntries.occurredAt,
      logDate: symptomEntries.logDate,
      severity: symptomEntries.severity,
      onsetLag: symptomEntries.onsetLag,
      groups: sql<
        string[] | null
      >`array_remove(array_agg(distinct ${symptomTypes.groupKey}), null)`.as('groups'),
    })
    .from(symptomEntries)
    .leftJoin(
      symptomEntrySymptoms,
      eq(symptomEntrySymptoms.entryId, symptomEntries.id)
    )
    .leftJoin(symptomTypes, eq(symptomTypes.id, symptomEntrySymptoms.symptomTypeId))
    .where(
      and(
        eq(symptomEntries.userId, userId),
        gte(symptomEntries.logDate, from),
        lte(symptomEntries.logDate, addDays(to, 1))
      )
    )
    .groupBy(symptomEntries.id)
    .orderBy(asc(symptomEntries.occurredAt));

  return rows.map((row) => ({
    id: row.id,
    mealId: row.mealId,
    occurredAt: row.occurredAt,
    logDate: row.logDate,
    severity: row.severity,
    onsetLag: row.onsetLag as OnsetLagKey | null,
    groups: (row.groups ?? []) as SymptomGroupKey[],
  }));
}

/** Analysed tag definitions — the candidate set, global rows only. */
export async function analysedTagDefs(): Promise<TagDefRow[]> {
  const rows = await db
    .select({
      id: foodTagDefs.id,
      key: foodTagDefs.key,
      labelDe: foodTagDefs.labelDe,
      isAnalysed: foodTagDefs.isAnalysed,
      primaryWindow: foodTagDefs.primaryWindow,
      minDoseGrams: foodTagDefs.minDoseGrams,
    })
    .from(foodTagDefs)
    .where(eq(foodTagDefs.isAnalysed, true))
    .orderBy(asc(foodTagDefs.sortOrder));

  return rows.map((row) => ({
    ...row,
    primaryWindow: row.primaryWindow as OnsetLagKey | null,
  }));
}

export type ScheduleWithMeta = Schedule & {
  category: string;
  medicationName: string;
  activeSubstance: string | null;
};

/**
 * Every schedule VERSION overlapping the range, for the given categories.
 *
 * `activeSchedules()` in `medication.ts` cannot be reused: it filters
 * `medications.is_active` and takes a single day. A stopped steroid and a
 * closed schedule version are exactly the history the analysis needs — a
 * closed version IS what a taper looks like.
 */
export async function scheduleVersionsRange(
  userId: string,
  from: LogDate,
  to: LogDate,
  categories: readonly MedCategory[]
): Promise<ScheduleWithMeta[]> {
  if (categories.length === 0) return [];

  const rows = await db
    .select({
      scheduleId: medicationSchedules.id,
      medicationId: medicationSchedules.medicationId,
      kind: medicationSchedules.kind,
      weekday: medicationSchedules.weekday,
      intervalDays: medicationSchedules.intervalDays,
      anchorDate: medicationSchedules.anchorDate,
      validFrom: medicationSchedules.validFrom,
      validTo: medicationSchedules.validTo,
      category: medications.category,
      medicationName: medications.name,
      activeSubstance: medications.activeSubstance,
      doseId: medicationScheduleDoses.id,
      timeOfDay: medicationScheduleDoses.timeOfDay,
      doseAmount: medicationScheduleDoses.doseAmount,
      doseUnit: medicationScheduleDoses.doseUnit,
      sortOrder: medicationScheduleDoses.sortOrder,
    })
    .from(medicationSchedules)
    .innerJoin(medications, eq(medications.id, medicationSchedules.medicationId))
    .leftJoin(
      medicationScheduleDoses,
      eq(medicationScheduleDoses.scheduleId, medicationSchedules.id)
    )
    .where(
      and(
        eq(medications.userId, userId),
        inArray(medications.category, [...categories]),
        lte(medicationSchedules.validFrom, to),
        sql`(${medicationSchedules.validTo} is null or ${medicationSchedules.validTo} >= ${from})`
      )
    )
    .orderBy(asc(medicationSchedules.validFrom));

  const byId = new Map<string, ScheduleWithMeta>();
  for (const row of rows) {
    let schedule = byId.get(row.scheduleId);
    if (!schedule) {
      schedule = {
        id: row.scheduleId,
        medicationId: row.medicationId,
        kind: row.kind,
        weekday: row.weekday,
        intervalDays: row.intervalDays,
        anchorDate: row.anchorDate,
        validFrom: row.validFrom,
        validTo: row.validTo,
        doses: [],
        category: row.category,
        medicationName: row.medicationName,
        activeSubstance: row.activeSubstance,
      };
      byId.set(row.scheduleId, schedule);
    }
    if (row.doseId && row.timeOfDay) {
      schedule.doses.push({
        id: row.doseId,
        timeOfDay: row.timeOfDay,
        doseAmount: row.doseAmount ?? 0,
        doseUnit: row.doseUnit ?? 'mg',
        sortOrder: row.sortOrder ?? 0,
      });
    }
  }

  return [...byId.values()];
}

export type IntakeRangeRow = {
  logDate: LogDate;
  medicationId: string;
  scheduleDoseId: string | null;
  status: 'taken' | 'skipped' | 'missed';
  doseAmount: number;
  doseUnit: string;
  category: string;
};

export async function intakeRange(
  userId: string,
  from: LogDate,
  to: LogDate
): Promise<IntakeRangeRow[]> {
  const rows = await db
    .select({
      logDate: medicationIntakes.logDate,
      medicationId: medicationIntakes.medicationId,
      scheduleDoseId: medicationIntakes.scheduleDoseId,
      status: medicationIntakes.status,
      doseAmount: medicationIntakes.doseAmount,
      doseUnit: medicationIntakes.doseUnit,
      category: medications.category,
    })
    .from(medicationIntakes)
    .innerJoin(medications, eq(medications.id, medicationIntakes.medicationId))
    .where(
      and(
        eq(medicationIntakes.userId, userId),
        gte(medicationIntakes.logDate, from),
        lte(medicationIntakes.logDate, to)
      )
    );

  return rows;
}

/**
 * Menstrual events. Call with `from` well BEFORE the range start — the first
 * days otherwise have no defined cycle phase for no better reason than the
 * query window.
 */
export async function menstrualEventRange(
  userId: string,
  from: LogDate,
  to: LogDate
): Promise<MenstrualEvent[]> {
  const rows = await db
    .select({
      eventDate: menstrualEvents.eventDate,
      kind: menstrualEvents.kind,
    })
    .from(menstrualEvents)
    .where(
      and(
        eq(menstrualEvents.userId, userId),
        gte(menstrualEvents.eventDate, from),
        lte(menstrualEvents.eventDate, to)
      )
    )
    .orderBy(asc(menstrualEvents.eventDate));

  return rows;
}

/**
 * Days inside an elimination protocol, which are excluded outright.
 *
 * `elimination.ts` states why in so many words: including them makes the
 * observational ranking circular, because the food was only avoided when she
 * felt bad. `planned` protocols are ignored — nothing has happened yet.
 */
export async function protocolDayIntervals(
  userId: string,
  from: LogDate,
  to: LogDate
): Promise<ProtocolInterval[]> {
  return db
    .select({
      startsOn: eliminationPhases.startsOn,
      endsOn: eliminationPhases.endsOn,
    })
    .from(eliminationPhases)
    .innerJoin(
      eliminationProtocols,
      eq(eliminationProtocols.id, eliminationPhases.protocolId)
    )
    .where(
      and(
        eq(eliminationProtocols.userId, userId),
        inArray(eliminationProtocols.status, ['active', 'completed']),
        lte(eliminationPhases.startsOn, to),
        sql`(${eliminationPhases.endsOn} is null or ${eliminationPhases.endsOn} >= ${from})`
      )
    );
}

/**
 * Which cycle events are already recorded for one day.
 *
 * Used by the daily form to show which chips are set. Insert-only, so this is
 * purely for display.
 */
export async function menstrualEventsForDay(
  userId: string,
  logDate: LogDate
): Promise<string[]> {
  const rows = await db
    .select({ kind: menstrualEvents.kind })
    .from(menstrualEvents)
    .where(
      and(eq(menstrualEvents.userId, userId), eq(menstrualEvents.eventDate, logDate))
    );
  return rows.map((row) => row.kind);
}

/**
 * Symptom severity per day and symptom group.
 *
 * `max` per group rather than a sum: severity is ordinal, so adding two entries
 * is not a defined operation — the same reason Model A takes a maximum.
 */
export async function symptomGroupsByDay(
  userId: string,
  from: LogDate,
  to: LogDate
): Promise<{ logDate: LogDate; groupKey: string; severity: number }[]> {
  return db
    .select({
      logDate: symptomEntries.logDate,
      groupKey: symptomTypes.groupKey,
      severity: sql<number>`max(${symptomEntries.severity})::int`.as('severity'),
    })
    .from(symptomEntries)
    .innerJoin(
      symptomEntrySymptoms,
      eq(symptomEntrySymptoms.entryId, symptomEntries.id)
    )
    .innerJoin(symptomTypes, eq(symptomTypes.id, symptomEntrySymptoms.symptomTypeId))
    .where(
      and(
        eq(symptomEntries.userId, userId),
        gte(symptomEntries.logDate, from),
        lte(symptomEntries.logDate, to)
      )
    )
    .groupBy(symptomEntries.logDate, symptomTypes.groupKey)
    .orderBy(asc(symptomEntries.logDate));
}

/**
 * Grams per day and BLS food group.
 *
 * The group comes from the leading letters of the BLS code, so it is a property
 * of the catalogue rather than of a name rule — which makes it more trustworthy
 * than the descriptive `group` tags for the question "what did I actually eat".
 * Foods with no catalogue entry are grouped as unknown rather than dropped: they
 * were still eaten, and hiding them would overstate every share.
 */
export async function foodGroupGramsByDay(
  userId: string,
  from: LogDate,
  to: LogDate
): Promise<{ logDate: LogDate; groupKey: string | null; grams: number }[]> {
  return db
    .select({
      logDate: meals.logDate,
      groupKey: foodCatalog.groupKey,
      grams: sql<number>`sum(${mealItems.grams})::double precision`.as('grams'),
    })
    .from(mealItems)
    .innerJoin(meals, eq(meals.id, mealItems.mealId))
    .innerJoin(foods, eq(foods.id, mealItems.foodId))
    .leftJoin(foodCatalog, eq(foodCatalog.id, foods.blsCatalogId))
    .where(
      and(eq(meals.userId, userId), gte(meals.logDate, from), lte(meals.logDate, to))
    )
    .groupBy(meals.logDate, foodCatalog.groupKey)
    .orderBy(asc(meals.logDate));
}

/**
 * Provenance of the food library actually used in the range — bls, off, manual.
 * Part of the data-quality card, which explains why some factors stay pending.
 */
export async function foodSourceGramsRange(
  userId: string,
  from: LogDate,
  to: LogDate
): Promise<{ source: string; grams: number }[]> {
  return db
    .select({
      source: foods.source,
      grams: sql<number>`sum(${mealItems.grams})::double precision`.as('grams'),
    })
    .from(mealItems)
    .innerJoin(meals, eq(meals.id, mealItems.mealId))
    .innerJoin(foods, eq(foods.id, mealItems.foodId))
    .where(
      and(eq(meals.userId, userId), gte(meals.logDate, from), lte(meals.logDate, to))
    )
    .groupBy(foods.source);
}

/**
 * The catalogue state, recorded in `params`.
 *
 * The measured doses are joined at analysis time rather than frozen onto
 * `meal_item`, so a future BLS release would change them. The catalogue is
 * seeded from a committed module and never edited, so within a deployment it is
 * fixed — but recording the state is what keeps an older run interpretable.
 */
export async function catalogState(): Promise<{
  rowCount: number;
  maxUpdatedAt: string | null;
}> {
  const [row] = await db
    .select({
      rowCount: sql<number>`count(*)::int`.as('row_count'),
      // A raw aggregate comes back as whatever the driver decides, so this is
      // normalised rather than assumed to be a Date.
      maxUpdatedAt: sql<
        string | Date | null
      >`max(${foodCatalog.updatedAt})`.as('max_updated_at'),
    })
    .from(foodCatalog);

  const raw = row?.maxUpdatedAt ?? null;
  return {
    rowCount: row?.rowCount ?? 0,
    maxUpdatedAt:
      raw === null ? null : new Date(raw as string | Date).toISOString(),
  };
}

/* --- persisted runs ------------------------------------------------------- */

export type StoredRun = {
  id: string;
  kind: string;
  rangeFrom: LogDate;
  rangeTo: LogDate;
  params: Record<string, unknown>;
  results: unknown[];
  computedAt: Date;
  durationMs: number | null;
};

export async function latestRun(
  userId: string,
  kind: string
): Promise<StoredRun | null> {
  const [row] = await db
    .select()
    .from(analysisRuns)
    .where(and(eq(analysisRuns.userId, userId), eq(analysisRuns.kind, kind)))
    .orderBy(desc(analysisRuns.computedAt))
    .limit(1);
  return row ?? null;
}

/** Newest first. Used by the stability indicator, which needs prior weeks. */
export async function recentRuns(
  userId: string,
  kind: string,
  limit = 12
): Promise<StoredRun[]> {
  return db
    .select()
    .from(analysisRuns)
    .where(and(eq(analysisRuns.userId, userId), eq(analysisRuns.kind, kind)))
    .orderBy(desc(analysisRuns.computedAt))
    .limit(limit);
}

export async function insertRun(input: {
  userId: string;
  kind: string;
  rangeFrom: LogDate;
  rangeTo: LogDate;
  params: Record<string, unknown>;
  results: unknown[];
  durationMs: number;
}): Promise<string> {
  const [row] = await db
    .insert(analysisRuns)
    .values(input)
    .returning({ id: analysisRuns.id });
  return row.id;
}
