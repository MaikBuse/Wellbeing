import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { db } from '../index';
import {
  foodPortions,
  foodTagDefs,
  foodTags,
  foods,
  mealItems,
  meals,
} from '../schema';

export type FoodListItem = {
  id: string;
  name: string;
  brand: string | null;
  kcal100: number | null;
  defaultPortionGrams: number | null;
  isBeverage: boolean;
  useCount: number;
};

const listColumns = {
  id: foods.id,
  name: foods.name,
  brand: foods.brand,
  kcal100: foods.kcal100,
  defaultPortionGrams: foods.defaultPortionGrams,
  isBeverage: foods.isBeverage,
  useCount: foods.useCount,
};

/**
 * "Häufig" for a slot. Ranked by usage WITHIN that slot, so after two weeks the
 * first three chips on the breakfast card are her actual breakfast — which is
 * what gets a known meal down to three taps.
 *
 * The library is shared but this ranking is not: it counts `userId`'s own meals,
 * which is the whole point of a per-slot order. Everything else in this file
 * reads the shared library and takes no user at all.
 */
export async function frequentFoodsForSlot(
  userId: string,
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink',
  limit = 12
): Promise<FoodListItem[]> {
  const uses = db
    .select({
      foodId: mealItems.foodId,
      uses: sql<number>`count(*)::int`.as('uses'),
    })
    .from(mealItems)
    .innerJoin(meals, eq(meals.id, mealItems.mealId))
    .where(and(eq(meals.userId, userId), eq(meals.slot, slot)))
    .groupBy(mealItems.foodId)
    .as('uses');

  const rows = await db
    .select(listColumns)
    .from(foods)
    .innerJoin(uses, eq(uses.foodId, foods.id))
    .where(isNull(foods.archivedAt))
    .orderBy(desc(uses.uses), desc(foods.lastUsedAt))
    .limit(limit);

  return rows;
}

/** "Zuletzt benutzt" across the shared library — fills the picker on a fresh
 * account, and shows what the other account entered today. */
export async function recentFoods(limit = 12): Promise<FoodListItem[]> {
  return db
    .select(listColumns)
    .from(foods)
    .where(isNull(foods.archivedAt))
    .orderBy(desc(foods.lastUsedAt), desc(foods.createdAt))
    .limit(limit);
}

/**
 * Local search first — the library is where almost every lookup should land.
 * ILIKE on a lowered-name index is plenty for a few hundred foods; pg_trgm
 * would have to be declared at CNPG bootstrap time (the DB owner is not a
 * superuser on purpose).
 */
export async function searchFoods(
  query: string,
  limit = 25
): Promise<FoodListItem[]> {
  const term = `%${query.trim()}%`;
  return db
    .select(listColumns)
    .from(foods)
    .where(
      and(
        isNull(foods.archivedAt),
        or(ilike(foods.name, term), ilike(foods.brand, term))
      )
    )
    .orderBy(desc(foods.useCount), foods.name)
    .limit(limit);
}

export async function findFoodByBarcode(barcode: string) {
  const [row] = await db
    .select()
    .from(foods)
    .where(eq(foods.barcode, barcode))
    .limit(1);
  return row ?? null;
}

export async function getFoodDetail(foodId: string) {
  const [food] = await db
    .select()
    .from(foods)
    .where(eq(foods.id, foodId))
    .limit(1);
  if (!food) return null;

  const [tags, portions] = await Promise.all([
    db
      .select({
        id: foodTagDefs.id,
        key: foodTagDefs.key,
        labelDe: foodTagDefs.labelDe,
        category: foodTagDefs.category,
        source: foodTags.source,
        confidence: foodTags.confidence,
      })
      .from(foodTags)
      .innerJoin(foodTagDefs, eq(foodTagDefs.id, foodTags.tagId))
      .where(eq(foodTags.foodId, foodId))
      .orderBy(foodTagDefs.sortOrder),
    db
      .select()
      .from(foodPortions)
      .where(eq(foodPortions.foodId, foodId))
      .orderBy(foodPortions.sortOrder),
  ]);

  return { food, tags, portions };
}

export async function allTagDefs() {
  return db
    .select()
    .from(foodTagDefs)
    .where(isNull(foodTagDefs.userId))
    .orderBy(foodTagDefs.sortOrder);
}
