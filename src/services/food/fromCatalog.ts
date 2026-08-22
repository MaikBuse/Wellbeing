/**
 * Copying a BLS catalog entry into the shared library.
 *
 * Separate from the server action because a Server Action cannot be called
 * outside a request scope — `requireUserForAction()` reads headers — and
 * `db:check` has to exercise this against a real Postgres. The action stays the
 * authentication boundary and passes the user id in; nothing here authenticates
 * anything, so nothing here may be reachable from a route.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { foodTags, foods, tagRules } from '@/db/schema';
import { getCatalogEntry } from '@/db/queries/foods';
import { deriveTags, tagInputFromCatalog } from '@/services/off/tagRules';

export type CopyResult =
  | { ok: true; foodId: string; created: boolean }
  | { ok: false; error: string };

/**
 * Copy-on-use rather than reading `food_catalog` as a food directly: the
 * catalog is an untouched reference, while a `food` accumulates corrections,
 * `overridden_fields` and a use count. It is also what freezes the nutrients —
 * a later BLS release must not rewrite meals already logged.
 *
 * The library is shared and `food_name_uq` is global, so a second person
 * picking the same staple lands on the existing food. Picking twice is a no-op,
 * not an error.
 */
export async function copyCatalogEntryToLibrary(
  userId: string,
  catalogId: string
): Promise<CopyResult> {
  const entry = await getCatalogEntry(catalogId);
  if (!entry) {
    return { ok: false, error: 'Dieses Lebensmittel gibt es im Katalog nicht' };
  }

  // Matches food_name_uq, which is on (lower(name), coalesce(lower(brand),'')).
  const existing = await findByName(entry.nameDe);
  if (existing) return { ok: true, foodId: existing, created: false };

  const isBeverage = entry.groupKey === 'N' || entry.groupKey === 'P';

  let foodId: string;
  try {
    const [food] = await db
      .insert(foods)
      .values({
        createdByUserId: userId,
        name: entry.nameDe,
        source: 'bls',
        blsCatalogId: entry.id,
        basisUnit: isBeverage ? 'ml' : 'g',
        isBeverage,
        kcal100: entry.kcal100,
        protein100: entry.protein100,
        fat100: entry.fat100,
        satFat100: entry.satFat100,
        carbs100: entry.carbs100,
        sugar100: entry.sugar100,
        fiber100: entry.fiber100,
        salt100: entry.salt100,
      })
      .returning({ id: foods.id });
    foodId = food.id;
  } catch (error) {
    // Lost a race against a concurrent pick of the same entry.
    if (!String(error).includes('food_name_uq')) {
      return { ok: false, error: 'Speichern fehlgeschlagen' };
    }
    const raced = await findByName(entry.nameDe);
    if (!raced) return { ok: false, error: 'Speichern fehlgeschlagen' };
    return { ok: true, foodId: raced, created: false };
  }

  const rules = await db
    .select({
      tagId: tagRules.tagId,
      matchType: tagRules.matchType,
      pattern: tagRules.pattern,
      confidence: tagRules.confidence,
      isNegative: tagRules.isNegative,
    })
    .from(tagRules)
    .where(eq(tagRules.enabled, true));

  const derived = deriveTags(tagInputFromCatalog(entry), rules);
  if (derived.length > 0) {
    await db
      .insert(foodTags)
      .values(
        derived.map((t) => ({
          foodId,
          tagId: t.tagId,
          source: t.source,
          confidence: t.confidence,
        }))
      )
      // A manual tag always wins, so never overwrite an existing assignment.
      .onConflictDoNothing();
  }

  return { ok: true, foodId, created: true };
}

async function findByName(name: string): Promise<string | null> {
  const [row] = await db
    .select({ id: foods.id })
    .from(foods)
    .where(
      and(sql`lower(${foods.name}) = lower(${name})`, isNull(foods.brand))
    )
    .limit(1);
  return row?.id ?? null;
}
