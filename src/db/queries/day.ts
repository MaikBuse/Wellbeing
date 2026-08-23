import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../index';
import {
  dailyLogJoints,
  dailyLogs,
  foodPortions,
  foods,
  joints,
  mealItems,
  meals,
  symptomEntries,
  symptomEntrySymptoms,
  symptomTypes,
} from '../schema';
import type { LogDate } from '@/lib/time';

/** One household measure a logged food can be counted in. */
export type DayPortionOption = {
  id: string;
  labelDe: string;
  grams: number;
  isDefault: boolean;
};

export type DayMealItem = {
  id: string;
  foodId: string;
  foodName: string;
  brand: string | null;
  grams: number;
  quantity: number;
  unit: 'g' | 'ml' | 'piece' | 'portion';
  /** Which named measure the quantity counts, if any. */
  portionId: string | null;
  kcal: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
  /**
   * Everything needed to re-resolve the amount in the row itself, so the unit
   * picker can preview grams without a round trip. Mirrors what `resolveGrams`
   * reads on the server.
   */
  basisUnit: 'g' | 'ml';
  defaultPortionGrams: number | null;
  densityGPerMl: number | null;
  portions: DayPortionOption[];
};

export type DayReaction = {
  id: string;
  /** The instant, not a formatted time: only the caller knows the user's zone. */
  occurredAt: Date;
  severity: number;
  onsetLag: string | null;
  note: string | null;
  symptoms: string[];
};

export type DayMeal = {
  id: string;
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink';
  occurredAt: Date;
  note: string | null;
  items: DayMealItem[];
  reactions: DayReaction[];
};

export async function getDayMeals(
  userId: string,
  logDate: LogDate
): Promise<DayMeal[]> {
  const mealRows = await db
    .select({
      id: meals.id,
      slot: meals.slot,
      occurredAt: meals.occurredAt,
      note: meals.note,
    })
    .from(meals)
    .where(and(eq(meals.userId, userId), eq(meals.logDate, logDate)))
    .orderBy(asc(meals.occurredAt));

  if (mealRows.length === 0) return [];
  const mealIds = mealRows.map((m) => m.id);

  const [itemRows, reactionRows] = await Promise.all([
    db
      .select({
        id: mealItems.id,
        mealId: mealItems.mealId,
        foodId: mealItems.foodId,
        foodName: foods.name,
        brand: foods.brand,
        grams: mealItems.grams,
        quantity: mealItems.quantity,
        unit: mealItems.unit,
        portionId: mealItems.portionId,
        basisUnit: foods.basisUnit,
        defaultPortionGrams: foods.defaultPortionGrams,
        densityGPerMl: foods.densityGPerMl,
        kcal: mealItems.kcal,
        proteinG: mealItems.proteinG,
        fatG: mealItems.fatG,
        carbsG: mealItems.carbsG,
        sortOrder: mealItems.sortOrder,
      })
      .from(mealItems)
      .innerJoin(foods, eq(foods.id, mealItems.foodId))
      .where(inArray(mealItems.mealId, mealIds))
      .orderBy(asc(mealItems.sortOrder)),
    db
      .select({
        id: symptomEntries.id,
        mealId: symptomEntries.mealId,
        occurredAt: symptomEntries.occurredAt,
        severity: symptomEntries.severity,
        onsetLag: symptomEntries.onsetLag,
        note: symptomEntries.note,
      })
      .from(symptomEntries)
      .where(inArray(symptomEntries.mealId, mealIds))
      // Several reactions per meal are the normal case, and until now their
      // order was whatever Postgres returned.
      .orderBy(asc(symptomEntries.occurredAt)),
  ]);

  // One extra query over the day's distinct foods, not one per row: a day with
  // twelve items usually has fewer than twelve foods, and the picker needs the
  // same list for every row that shares a food.
  const foodIds = [...new Set(itemRows.map((i) => i.foodId))];
  const portionRows =
    foodIds.length > 0
      ? await db
          .select({
            id: foodPortions.id,
            foodId: foodPortions.foodId,
            labelDe: foodPortions.labelDe,
            grams: foodPortions.grams,
            isDefault: foodPortions.isDefault,
          })
          .from(foodPortions)
          .where(inArray(foodPortions.foodId, foodIds))
          .orderBy(asc(foodPortions.sortOrder), asc(foodPortions.labelDe))
      : [];

  const portionsByFood = new Map<string, DayPortionOption[]>();
  for (const row of portionRows) {
    const list = portionsByFood.get(row.foodId) ?? [];
    list.push({
      id: row.id,
      labelDe: row.labelDe,
      grams: row.grams,
      isDefault: row.isDefault,
    });
    portionsByFood.set(row.foodId, list);
  }

  const reactionIds = reactionRows.map((r) => r.id);
  const symptomRows =
    reactionIds.length > 0
      ? await db
          .select({
            entryId: symptomEntrySymptoms.entryId,
            labelDe: symptomTypes.labelDe,
          })
          .from(symptomEntrySymptoms)
          .innerJoin(
            symptomTypes,
            eq(symptomTypes.id, symptomEntrySymptoms.symptomTypeId)
          )
          .where(inArray(symptomEntrySymptoms.entryId, reactionIds))
      : [];

  const symptomsByEntry = new Map<string, string[]>();
  for (const row of symptomRows) {
    const list = symptomsByEntry.get(row.entryId) ?? [];
    list.push(row.labelDe);
    symptomsByEntry.set(row.entryId, list);
  }

  return mealRows.map((meal) => ({
    ...meal,
    items: itemRows
      .filter((i) => i.mealId === meal.id)
      .map((i) => ({
        id: i.id,
        foodId: i.foodId,
        foodName: i.foodName,
        brand: i.brand,
        grams: i.grams,
        quantity: i.quantity,
        unit: i.unit,
        portionId: i.portionId,
        kcal: i.kcal,
        proteinG: i.proteinG,
        fatG: i.fatG,
        carbsG: i.carbsG,
        // The enum allows 'piece' and 'portion' here; nutrients are per 100 of a
        // mass or a volume and nothing else, so anything but 'ml' reads as g.
        basisUnit: i.basisUnit === 'ml' ? ('ml' as const) : ('g' as const),
        defaultPortionGrams: i.defaultPortionGrams,
        densityGPerMl: i.densityGPerMl,
        portions: portionsByFood.get(i.foodId) ?? [],
      })),
    reactions: reactionRows
      .filter((r) => r.mealId === meal.id)
      .map((r) => ({
        id: r.id,
        occurredAt: r.occurredAt,
        severity: r.severity,
        onsetLag: r.onsetLag,
        note: r.note,
        symptoms: symptomsByEntry.get(r.id) ?? [],
      })),
  }));
}

export async function getDailyLog(userId: string, logDate: LogDate) {
  const [row] = await db
    .select()
    .from(dailyLogs)
    .where(and(eq(dailyLogs.userId, userId), eq(dailyLogs.logDate, logDate)))
    .limit(1);
  return row ?? null;
}

export async function getDailyLogJoints(dailyLogId: string) {
  return db
    .select({
      jointId: dailyLogJoints.jointId,
      jointKey: joints.key,
      labelDe: joints.labelDe,
      side: dailyLogJoints.side,
    })
    .from(dailyLogJoints)
    .innerJoin(joints, eq(joints.id, dailyLogJoints.jointId))
    .where(eq(dailyLogJoints.dailyLogId, dailyLogId));
}

/** Standalone symptom entries — a 03:00 flare belongs to no meal. */
export async function getStandaloneSymptoms(
  userId: string,
  logDate: LogDate
): Promise<DayReaction[]> {
  const entries = await db
    .select({
      id: symptomEntries.id,
      severity: symptomEntries.severity,
      onsetLag: symptomEntries.onsetLag,
      note: symptomEntries.note,
      occurredAt: symptomEntries.occurredAt,
      mealId: symptomEntries.mealId,
    })
    .from(symptomEntries)
    .where(
      and(
        eq(symptomEntries.userId, userId),
        eq(symptomEntries.logDate, logDate)
      )
    )
    .orderBy(asc(symptomEntries.occurredAt));

  const standalone = entries.filter((e) => e.mealId === null);
  if (standalone.length === 0) return [];

  const symptomRows = await db
    .select({
      entryId: symptomEntrySymptoms.entryId,
      labelDe: symptomTypes.labelDe,
    })
    .from(symptomEntrySymptoms)
    .innerJoin(
      symptomTypes,
      eq(symptomTypes.id, symptomEntrySymptoms.symptomTypeId)
    )
    .where(
      inArray(
        symptomEntrySymptoms.entryId,
        standalone.map((e) => e.id)
      )
    );

  return standalone.map((e) => ({
    id: e.id,
    occurredAt: e.occurredAt,
    severity: e.severity,
    onsetLag: e.onsetLag,
    note: e.note,
    symptoms: symptomRows
      .filter((s) => s.entryId === e.id)
      .map((s) => s.labelDe),
  }));
}

/**
 * The symptom picker: global types only, archived ones excluded.
 *
 * Both filters were missing, unlike in allTagDefs(). Without the user filter
 * this returns every user's private types, and without the archived filter it
 * keeps offering types that were explicitly retired.
 */
export async function allSymptomTypes() {
  return db
    .select()
    .from(symptomTypes)
    .where(and(isNull(symptomTypes.userId), isNull(symptomTypes.archivedAt)))
    .orderBy(asc(symptomTypes.sortOrder));
}

export async function das28Joints() {
  return db
    .select()
    .from(joints)
    .where(eq(joints.inDas28, true))
    .orderBy(asc(joints.sortOrder));
}

export async function allJoints() {
  return db.select().from(joints).orderBy(asc(joints.sortOrder));
}
