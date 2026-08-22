import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db } from '../index';
import {
  foodCatalog,
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

export type CatalogListItem = {
  id: string;
  blsCode: string;
  nameDe: string;
  kcal100: number | null;
  isEveryday: boolean;
};

/**
 * The BLS fallback, for when the library has nothing.
 *
 * Two things make this more than an ILIKE.
 *
 * The BLS writes compounds apart — "Hafer Flocken", "Reis poliert", "Hafer
 * ganzes Korn" — while nobody types "Hafer Flocken". A plain `%haferflocken%`
 * therefore misses the oats entirely and returns six kinds of
 * Haferflockenauflauf, which is how this was found. So the name and the term
 * are both squashed (spaces, commas, hyphens and slashes removed) and matched
 * that way as well.
 *
 * And ordering is not a detail: the BLS enumerates every preparation of every
 * food, so "apfel" matches a dozen rows of equal textual relevance. Everyday
 * staples first (seed/data/bls-everyday.ts), then the earliest position of the
 * match — a name that begins with the term beats one that buries it — then the
 * shortest name, which is reliably the plainest variant. "Apfel roh" before
 * "Apfelrotkohl gedünstet".
 *
 * A sequential scan over 7140 rows is nothing, which is just as well: the
 * squashed match cannot use the plain-name index, and pg_trgm would have to be
 * declared at CNPG bootstrap (see `searchFoods` above).
 */
const squashed = (column: PgColumn) =>
  sql`regexp_replace(lower(${column}), '[ ,/-]', '', 'g')`;

export async function searchCatalog(
  query: string,
  limit = 15
): Promise<CatalogListItem[]> {
  const term = query.trim();
  if (term.length < 2) return [];

  const squashedTerm = term.toLowerCase().replace(/[ ,/-]/g, '');
  const name = foodCatalog.nameDe;
  // Position of the match in the squashed name; 0 (no match) sorts last.
  const position = sql`nullif(strpos(${squashed(name)}, ${squashedTerm}), 0)`;

  return db
    .select({
      id: foodCatalog.id,
      blsCode: foodCatalog.blsCode,
      nameDe: foodCatalog.nameDe,
      kcal100: foodCatalog.kcal100,
      isEveryday: foodCatalog.isEveryday,
    })
    .from(foodCatalog)
    .where(
      or(
        ilike(name, `%${term}%`),
        sql`${squashed(name)} like ${'%' + squashedTerm + '%'}`
      )
    )
    .orderBy(
      desc(foodCatalog.isEveryday),
      sql`${position} nulls last`,
      sql`length(${name})`,
      name
    )
    .limit(limit);
}

export async function getCatalogEntry(catalogId: string) {
  const [row] = await db
    .select()
    .from(foodCatalog)
    .where(eq(foodCatalog.id, catalogId))
    .limit(1);
  return row ?? null;
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
