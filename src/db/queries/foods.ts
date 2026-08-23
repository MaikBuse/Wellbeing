import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
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
import { isSearchable, searchTokens } from '@/lib/search/terms';
import { searchScore, searchWhere } from './search-rank';

export type FoodListItem = {
  id: string;
  name: string;
  brand: string | null;
  kcal100: number | null;
  defaultPortionGrams: number | null;
  /** 'g' or 'ml' — the unit the kcal figure in the list is per 100 OF. */
  basisUnit: 'g' | 'ml' | 'piece' | 'portion';
  isBeverage: boolean;
  useCount: number;
};

const listColumns = {
  id: foods.id,
  name: foods.name,
  brand: foods.brand,
  kcal100: foods.kcal100,
  defaultPortionGrams: foods.defaultPortionGrams,
  basisUnit: foods.basisUnit,
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
 *
 * It shares its ranking with `searchCatalog` below (see ./search-rank.ts).
 * Before, it had none: a plain double-sided ILIKE ordered by `use_count`, with
 * no squashing, so a food copied out of the catalog as "Hafer Flocken" could
 * not be found in one's own library by typing "haferflocken" — the exact miss
 * the catalog search was written to fix, one table over.
 *
 * Brand is covered because `search_folded` is generated over name and brand
 * together.
 */
export async function searchFoods(
  query: string,
  limit = 25
): Promise<FoodListItem[]> {
  const whole = query.trim();
  const tokens = searchTokens(whole);
  if (!isSearchable(whole) || tokens.length === 0) return [];

  const target = { folded: foods.searchFolded, squashed: foods.searchSquashed };
  const scored = db.$with('scored').as(
    db
      .select({
        ...listColumns,
        score: searchScore(target, tokens, whole).as('score'),
      })
      .from(foods)
      .where(and(isNull(foods.archivedAt), searchWhere(target, tokens)))
  );

  return db
    .with(scored)
    .select({
      id: scored.id,
      name: scored.name,
      brand: scored.brand,
      kcal100: scored.kcal100,
      defaultPortionGrams: scored.defaultPortionGrams,
      basisUnit: scored.basisUnit,
      isBeverage: scored.isBeverage,
      useCount: scored.useCount,
    })
    .from(scored)
    .orderBy(asc(scored.score), desc(scored.useCount), asc(scored.name))
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
 * Same ranking as the library search — see ./search-rank.ts, which carries the
 * reasoning. What it has to cope with beyond a plain ILIKE:
 *
 * The BLS writes compounds apart — "Hafer Flocken", "Reis poliert", "Hafer
 * ganzes Korn" — while nobody types "Hafer Flocken". A plain `%haferflocken%`
 * therefore misses the oats entirely and returns six kinds of
 * Haferflockenauflauf, which is how this was found. Both sides are squashed
 * (everything but a-z0-9 removed) and matched on that axis too.
 *
 * And ordering is not a detail: the BLS enumerates every preparation of every
 * food, so "apfel" matches over a hundred rows of comparable textual relevance.
 * The everyday shortlist (seed/data/bls-everyday.ts) settles those ties, and
 * the shortest name after it — reliably the plainest variant. "Apfel roh"
 * before "Apfelrotkohl gedünstet". What changed is that `is_everyday` is now a
 * tiebreaker rather than the first sort key: as the first key it put every
 * everyday row containing the letters "ei" — `Weinessig`, `Weißwein trocken` —
 * ahead of `Hühnerei roh`.
 *
 * A sequential scan over 7140 rows is nothing, which is just as well: neither
 * axis can use a plain-name index. pg_trgm would make the scan an index lookup
 * and add tolerance for typos, and it is not used here by choice rather than by
 * necessity — contrary to what this comment said before, `pg_trgm` is a
 * *trusted* extension on Postgres 17 and its `CREATE EXTENSION` needs no
 * superuser. It is a separate change: `CREATE EXTENSION` would run in the
 * migrate init container against CNPG, and the deterministic ranking below can
 * be tested against known data first.
 */
export async function searchCatalog(
  query: string,
  limit = 15
): Promise<CatalogListItem[]> {
  const whole = query.trim();
  const tokens = searchTokens(whole);
  if (!isSearchable(whole) || tokens.length === 0) return [];

  const target = {
    folded: foodCatalog.searchFolded,
    squashed: foodCatalog.searchSquashed,
    alias: foodCatalog.searchAlias,
  };
  const scored = db.$with('scored').as(
    db
      .select({
        id: foodCatalog.id,
        blsCode: foodCatalog.blsCode,
        nameDe: foodCatalog.nameDe,
        kcal100: foodCatalog.kcal100,
        isEveryday: foodCatalog.isEveryday,
        score: searchScore(target, tokens, whole).as('score'),
      })
      .from(foodCatalog)
      .where(searchWhere(target, tokens))
  );

  return db
    .with(scored)
    .select({
      id: scored.id,
      blsCode: scored.blsCode,
      nameDe: scored.nameDe,
      kcal100: scored.kcal100,
      isEveryday: scored.isEveryday,
    })
    .from(scored)
    .orderBy(
      asc(scored.score),
      desc(scored.isEveryday),
      sql`length(${scored.nameDe})`,
      asc(scored.nameDe)
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

/**
 * The unit names already in use, most common first.
 *
 * No user filter, by design: `food_portion` belongs to the shared catalog, and
 * the point of the list is that the household measure someone spelled once is
 * offered as a chip everywhere else rather than retyped.
 */
export async function distinctPortionLabels(limit = 20): Promise<string[]> {
  const rows = await db
    .select({
      labelDe: sql<string>`min(${foodPortions.labelDe})`,
      uses: sql<number>`count(*)::int`,
    })
    .from(foodPortions)
    .groupBy(sql`lower(${foodPortions.labelDe})`)
    .orderBy(sql`count(*) desc`)
    .limit(limit);
  return rows.map((row) => row.labelDe);
}
