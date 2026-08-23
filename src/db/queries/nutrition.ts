import { and, asc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db } from '../index';
import {
  dailyLogs,
  foodCatalog,
  foods,
  mealItems,
  meals,
  medicationNutrients,
  medications,
  nutritionTargetOverrides,
  userNutritionProfiles,
} from '../schema';
import {
  CATALOG_NUTRIENTS,
  NUTRIENT_META,
  SNAPSHOT_NUTRIENTS,
  type NutrientKey,
} from '@/lib/nutrients';
import type { MealSlotKey } from '@/lib/scales';
import type { LogDate } from '@/lib/time';
import type { NutrientItemRow } from '@/services/nutrition/types';
import type { ProfileVersion } from '@/services/nutrition/targets/derive';

/**
 * Reads for the nutrient-goal screens.
 *
 * A file of its own rather than more of `analysis.ts` (which says at the top
 * that it holds the analysis range queries) or of `day.ts` (which is all
 * single-day logic). One query serves both the day screen and the range screens
 * by taking `from === to` for a single day — the same reasoning the header of
 * `queries/progress.ts` gives for not writing a second definition of what a day
 * looks like.
 *
 * Aggregation deliberately happens in TypeScript, in
 * `services/nutrition/aggregate.ts`. Twenty-five nutrients times two aggregates
 * would be fifty SQL expressions, and the null handling and the coverage rule —
 * the two things most worth testing — would then live somewhere Vitest cannot
 * reach. `mealMeasuredRange` made the same call for the same reason.
 */

/*
 * The columns are looked up by the name `NUTRIENT_META` declares rather than
 * spelled out twice. `src/lib/__tests__/nutrients.test.ts` asserts every one of
 * those names exists on the table, so a typo fails a test rather than
 * silently selecting nothing.
 */
const catalogColumns = foodCatalog as unknown as Record<string, PgColumn>;
const itemColumns = mealItems as unknown as Record<string, PgColumn>;

function columnFor(key: NutrientKey): PgColumn {
  const source = NUTRIENT_META[key].source;
  if (source.kind === 'catalog') return catalogColumns[source.column];
  if (source.kind === 'snapshot') return itemColumns[source.column];
  throw new Error(`Nutrient ${key} has no column`);
}

/**
 * Every logged item in the range, with the frozen macros and the live catalog
 * values side by side.
 *
 * The LEFT JOIN onto `food_catalog` is the whole point, and there is no
 * `coalesce(..., 0)` anywhere near it: a food without a catalog link has no
 * micronutrient values, and that is not the same as having zeroes.
 *
 * Scoped through `meal.user_id`, never through `food` — the food library is
 * shared, the diary is not.
 */
export async function nutrientItemRange(
  userId: string,
  from: LogDate,
  to: LogDate
): Promise<NutrientItemRow[]> {
  const selection: Record<string, PgColumn | ReturnType<typeof sql>> = {
    logDate: meals.logDate,
    slot: meals.slot,
    grams: mealItems.grams,
    quantity: mealItems.quantity,
    unit: mealItems.unit,
    portionId: mealItems.portionId,
    catalogId: foods.blsCatalogId,
    overriddenFields: foods.overriddenFields,
  };
  for (const key of [...SNAPSHOT_NUTRIENTS, ...CATALOG_NUTRIENTS]) {
    selection[key] = columnFor(key);
  }

  const rows = await db
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select(selection as any)
    .from(mealItems)
    .innerJoin(meals, eq(meals.id, mealItems.mealId))
    .innerJoin(foods, eq(foods.id, mealItems.foodId))
    .leftJoin(foodCatalog, eq(foodCatalog.id, foods.blsCatalogId))
    .where(
      and(eq(meals.userId, userId), gte(meals.logDate, from), lte(meals.logDate, to))
    )
    .orderBy(asc(meals.logDate));

  return (rows as unknown as RawNutrientRow[]).map(toItemRow);
}

type RawNutrientRow = Record<string, unknown> & {
  logDate: LogDate;
  slot: MealSlotKey;
  grams: number;
  quantity: number;
  unit: string;
  portionId: string | null;
  catalogId: string | null;
  overriddenFields: string[] | null;
};

function toItemRow(row: RawNutrientRow): NutrientItemRow {
  const snapshot: Partial<Record<NutrientKey, number | null>> = {};
  for (const key of SNAPSHOT_NUTRIENTS) {
    snapshot[key] = (row[key] as number | null) ?? null;
  }

  let per100: Partial<Record<NutrientKey, number | null>> | null = null;
  if (row.catalogId !== null) {
    per100 = {};
    for (const key of CATALOG_NUTRIENTS) {
      per100[key] = (row[key] as number | null) ?? null;
    }
  }

  return {
    logDate: row.logDate,
    slot: row.slot,
    grams: row.grams,
    snapshot,
    per100,
    // "She said something about the amount": a named portion, a quantity other
    // than one, or a unit other than the default portion. Same rule as
    // `mealMeasuredRange`, because it answers the same question.
    hasStatedAmount:
      row.portionId !== null || Number(row.quantity) !== 1 || row.unit !== 'portion',
    wasOverridden: (row.overriddenFields?.length ?? 0) > 0,
  };
}

/** Every profile version, oldest first. Resolution happens in `profileForDay`. */
export async function nutritionProfileVersions(
  userId: string
): Promise<ProfileVersion[]> {
  const rows = await db
    .select({
      validFrom: userNutritionProfiles.validFrom,
      validTo: userNutritionProfiles.validTo,
      referenceSex: userNutritionProfiles.referenceSex,
      birthYear: userNutritionProfiles.birthYear,
      heightCm: userNutritionProfiles.heightCm,
      activityLevel: userNutritionProfiles.activityLevel,
      goal: userNutritionProfiles.goal,
      hasSarcopenia: userNutritionProfiles.hasSarcopenia,
      menopauseStage: userNutritionProfiles.menopauseStage,
      dietForm: userNutritionProfiles.dietForm,
      renalImpairment: userNutritionProfiles.renalImpairment,
      proteinMaxGPerKg: userNutritionProfiles.proteinMaxGPerKg,
      weightSource: userNutritionProfiles.weightSource,
      referenceWeightKg: userNutritionProfiles.referenceWeightKg,
    })
    .from(userNutritionProfiles)
    .where(eq(userNutritionProfiles.userId, userId))
    .orderBy(asc(userNutritionProfiles.validFrom));

  return rows as ProfileVersion[];
}

/** The open profile version, or null when the questionnaire was never filled in. */
export async function openNutritionProfile(userId: string) {
  const [row] = await db
    .select()
    .from(userNutritionProfiles)
    .where(
      and(
        eq(userNutritionProfiles.userId, userId),
        sql`${userNutritionProfiles.validTo} is null`
      )
    )
    .limit(1);
  return row ?? null;
}

export type TargetOverrideRow = {
  nutrientKey: NutrientKey;
  min: number | null;
  max: number | null;
  unit: string;
  disabled: boolean;
  reason: string | null;
  validFrom: LogDate;
  validTo: LogDate | null;
};

export async function targetOverrideRows(
  userId: string
): Promise<TargetOverrideRow[]> {
  const rows = await db
    .select({
      nutrientKey: nutritionTargetOverrides.nutrientKey,
      min: nutritionTargetOverrides.minValue,
      max: nutritionTargetOverrides.maxValue,
      unit: nutritionTargetOverrides.unit,
      disabled: nutritionTargetOverrides.disabled,
      reason: nutritionTargetOverrides.reason,
      validFrom: nutritionTargetOverrides.validFrom,
      validTo: nutritionTargetOverrides.validTo,
    })
    .from(nutritionTargetOverrides)
    .where(eq(nutritionTargetOverrides.userId, userId))
    .orderBy(asc(nutritionTargetOverrides.validFrom));

  return rows as TargetOverrideRow[];
}

/** The nutrient mapping for this user's preparations. */
export async function medicationNutrientRows(userId: string) {
  return db
    .select({
      medicationId: medicationNutrients.medicationId,
      nutrientKey: medicationNutrients.nutrientKey,
      amountPerPiece: medicationNutrients.amountPerPiece,
      unit: medicationNutrients.unit,
    })
    .from(medicationNutrients)
    .innerJoin(medications, eq(medications.id, medicationNutrients.medicationId))
    .where(eq(medications.userId, userId));
}

/**
 * Preparations that could carry a nutrient, with whatever is already mapped.
 *
 * Every active medication, not only `category = 'supplement'`: a combination
 * product is often filed under something else, and a list that silently hides
 * the row someone is looking for is worse than a slightly longer one.
 */
export async function supplementCandidates(userId: string): Promise<
  {
    id: string;
    name: string;
    category: string;
    mapped: { nutrientKey: NutrientKey; amountPerPiece: number; unit: string }[];
  }[]
> {
  const [meds, mapping] = await Promise.all([
    db
      .select({
        id: medications.id,
        name: medications.name,
        category: medications.category,
      })
      .from(medications)
      .where(and(eq(medications.userId, userId), eq(medications.isActive, true)))
      .orderBy(asc(medications.name)),
    medicationNutrientRows(userId),
  ]);

  const byMedication = new Map<
    string,
    { nutrientKey: NutrientKey; amountPerPiece: number; unit: string }[]
  >();
  for (const row of mapping) {
    const list = byMedication.get(row.medicationId) ?? [];
    list.push({
      nutrientKey: row.nutrientKey as NutrientKey,
      amountPerPiece: row.amountPerPiece,
      unit: row.unit,
    });
    byMedication.set(row.medicationId, list);
  }

  return meds.map((med) => ({
    ...med,
    mapped: byMedication.get(med.id) ?? [],
  }));
}

/**
 * Body weight per day, for the weight-scaled targets.
 *
 * Only the days that actually carry a weighing; `referenceWeightSeries` widens
 * that into a 28-day median over the dense calendar.
 */
export async function weightRange(
  userId: string,
  from: LogDate,
  to: LogDate
): Promise<{ logDate: LogDate; weightKg: number }[]> {
  const rows = await db
    .select({ logDate: dailyLogs.logDate, weightKg: dailyLogs.weightKg })
    .from(dailyLogs)
    .where(
      and(
        eq(dailyLogs.userId, userId),
        gte(dailyLogs.logDate, from),
        lte(dailyLogs.logDate, to),
        isNotNull(dailyLogs.weightKg)
      )
    )
    .orderBy(asc(dailyLogs.logDate));

  return rows as { logDate: LogDate; weightKg: number }[];
}

/** Flare flags per day, the signal that makes a day neutral. */
export async function flareDays(
  userId: string,
  from: LogDate,
  to: LogDate
): Promise<Set<LogDate>> {
  const rows = await db
    .select({ logDate: dailyLogs.logDate })
    .from(dailyLogs)
    .where(
      and(
        eq(dailyLogs.userId, userId),
        gte(dailyLogs.logDate, from),
        lte(dailyLogs.logDate, to),
        eq(dailyLogs.isFlare, true)
      )
    );
  return new Set(rows.map((row) => row.logDate as LogDate));
}
