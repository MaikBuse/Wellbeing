'use server';

import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { requireUserForAction } from '@/auth.helpers';
import { db } from '@/db';
import {
  foodPortions,
  foodTagDefs,
  foodTags,
  foods,
  offProducts,
  tagRules,
} from '@/db/schema';
import {
  lookupOffProduct,
  parseServingGrams,
  type OffProductData,
} from '@/lib/off';
import { searchCatalog, searchFoods } from '@/db/queries/foods';
import { copyCatalogEntryToLibrary } from '@/services/food/fromCatalog';
import { revalidateFoods } from '@/lib/revalidate';
import {
  deriveTags,
  tagInputFromName,
  tagInputFromOff,
  type TagRule,
} from '@/services/off/tagRules';
import {
  barcodeSchema,
  createFoodSchema,
  catalogIdSchema,
  updateFoodTagsSchema,
} from '@/lib/validation/food';
import type { ActionResult } from './meals';

async function loadRules(): Promise<TagRule[]> {
  const rows = await db
    .select({
      tagId: tagRules.tagId,
      matchType: tagRules.matchType,
      pattern: tagRules.pattern,
      confidence: tagRules.confidence,
      isNegative: tagRules.isNegative,
    })
    .from(tagRules)
    .where(eq(tagRules.enabled, true));
  return rows;
}

async function applyDerivedTags(
  foodId: string,
  derived: ReturnType<typeof deriveTags>
) {
  if (derived.length === 0) return;
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

/**
 * Tag definitions are still per-user (`user_id IS NULL` = global, see
 * lookup.ts), so a tag id arriving from a form has to be one this account is
 * allowed to use. Without this, another account's private tag could be attached
 * to a food in the shared library.
 */
async function assertTagsAllowed(
  userId: string,
  tagIds: string[]
): Promise<boolean> {
  if (tagIds.length === 0) return true;
  const allowed = await db
    .select({ id: foodTagDefs.id })
    .from(foodTagDefs)
    .where(
      and(
        inArray(foodTagDefs.id, tagIds),
        or(isNull(foodTagDefs.userId), eq(foodTagDefs.userId, userId))
      )
    );
  return allowed.length === new Set(tagIds).size;
}

export async function searchFoodsAction(query: string) {
  await requireUserForAction();
  if (query.trim().length < 2) return [];
  return searchFoods(query);
}

/**
 * The BLS fallback for the picker. Asked for only when the library is thin, so
 * the three-tap path never waits on it.
 */
export async function searchCatalogAction(query: string) {
  await requireUserForAction();
  return searchCatalog(query);
}

/**
 * Barcode lookup: own library first, then the shared OFF cache, and only then
 * the network. Repeat scans are instant, OFF stays well under its rate limit,
 * and the app keeps working when OFF is down.
 */
export async function lookupBarcode(
  barcode: string
): Promise<
  | { kind: 'existing'; foodId: string; name: string }
  | { kind: 'prefilled'; product: OffProductData }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string }
> {
  await requireUserForAction();
  const parsed = barcodeSchema.safeParse({ barcode });
  if (!parsed.success) {
    return { kind: 'error', message: 'Ungültiger Barcode' };
  }
  const code = parsed.data.barcode;

  const [own] = await db
    .select({ id: foods.id, name: foods.name })
    .from(foods)
    .where(eq(foods.barcode, code))
    .limit(1);
  if (own) return { kind: 'existing', foodId: own.id, name: own.name };

  const [cached] = await db
    .select()
    .from(offProducts)
    .where(eq(offProducts.barcode, code))
    .limit(1);

  if (cached) {
    return {
      kind: 'prefilled',
      product: {
        barcode: cached.barcode,
        productName: cached.productName,
        brands: cached.brands,
        quantity: cached.quantity,
        servingSize: cached.servingSize,
        categoriesTags: cached.categoriesTags ?? [],
        allergensTags: cached.allergensTags ?? [],
        tracesTags: cached.tracesTags ?? [],
        additivesTags: cached.additivesTags ?? [],
        ingredientsText: cached.ingredientsText,
        novaGroup: cached.novaGroup,
        kcal100: cached.kcal100,
        protein100: cached.protein100,
        fat100: cached.fat100,
        satFat100: cached.satFat100,
        carbs100: cached.carbs100,
        sugar100: cached.sugar100,
        fiber100: cached.fiber100,
        salt100: cached.salt100,
        raw: cached.raw ?? {},
        needsManualNutrients: cached.kcal100 === null,
      },
    };
  }

  const result = await lookupOffProduct(code);
  if (result.kind === 'not_found') return { kind: 'not_found' };
  if (result.kind === 'error') {
    const messages = {
      timeout: 'Open Food Facts antwortet nicht. Bitte manuell eintragen.',
      upstream: 'Open Food Facts ist gerade nicht erreichbar.',
      invalid: 'Die Antwort von Open Food Facts war unbrauchbar.',
    };
    return { kind: 'error', message: messages[result.reason] };
  }

  const p = result.product;
  await db
    .insert(offProducts)
    .values({
      barcode: p.barcode,
      productName: p.productName,
      brands: p.brands,
      quantity: p.quantity,
      servingSize: p.servingSize,
      categoriesTags: p.categoriesTags,
      allergensTags: p.allergensTags,
      tracesTags: p.tracesTags,
      additivesTags: p.additivesTags,
      ingredientsText: p.ingredientsText,
      novaGroup: p.novaGroup,
      kcal100: p.kcal100,
      protein100: p.protein100,
      fat100: p.fat100,
      satFat100: p.satFat100,
      carbs100: p.carbs100,
      sugar100: p.sugar100,
      fiber100: p.fiber100,
      salt100: p.salt100,
      raw: p.raw,
    })
    .onConflictDoNothing();

  return { kind: 'prefilled', product: p };
}

/** Creates a food from an OFF hit, tags it from the rules, and returns its id. */
export async function createFoodFromOff(
  barcode: string
): Promise<{ ok: true; foodId: string } | { ok: false; error: string }> {
  const user = await requireUserForAction();
  const lookup = await lookupBarcode(barcode);
  if (lookup.kind === 'existing') return { ok: true, foodId: lookup.foodId };
  if (lookup.kind !== 'prefilled') {
    return {
      ok: false,
      error:
        lookup.kind === 'error'
          ? lookup.message
          : 'Dieses Produkt kennt Open Food Facts nicht. Du kannst es selbst anlegen.',
    };
  }

  const p = lookup.product;
  const [offRow] = await db
    .select({ id: offProducts.id })
    .from(offProducts)
    .where(eq(offProducts.barcode, p.barcode))
    .limit(1);

  const servingGrams = parseServingGrams(p.servingSize);
  const [food] = await db
    .insert(foods)
    .values({
      createdByUserId: user.id,
      name: p.productName ?? `Produkt ${p.barcode}`,
      brand: p.brands,
      source: 'off',
      offProductId: offRow?.id ?? null,
      barcode: p.barcode,
      kcal100: p.kcal100,
      protein100: p.protein100,
      fat100: p.fat100,
      satFat100: p.satFat100,
      carbs100: p.carbs100,
      sugar100: p.sugar100,
      fiber100: p.fiber100,
      salt100: p.salt100,
      defaultPortionGrams: servingGrams,
    })
    .returning({ id: foods.id });

  if (servingGrams) {
    await db.insert(foodPortions).values({
      foodId: food.id,
      labelDe: 'Portion',
      grams: servingGrams,
      isDefault: true,
    });
  }

  const rules = await loadRules();
  await applyDerivedTags(food.id, deriveTags(tagInputFromOff(p), rules));

  revalidateFoods();
  return { ok: true, foodId: food.id };
}

/**
 * Thin auth wrapper: everything the copy actually does lives in
 * `copyCatalogEntryToLibrary`, so `db:check` can exercise it against a real
 * Postgres without a request scope.
 */
export async function createFoodFromCatalog(
  catalogId: string
): Promise<{ ok: true; foodId: string } | { ok: false; error: string }> {
  const user = await requireUserForAction();
  const parsed = catalogIdSchema.safeParse({ catalogId });
  if (!parsed.success) return { ok: false, error: 'Eingabe ungültig' };

  const result = await copyCatalogEntryToLibrary(
    user.id,
    parsed.data.catalogId
  );
  if (!result.ok) return result;

  if (result.created) revalidateFoods();
  return { ok: true, foodId: result.foodId };
}

export async function createFood(
  formData: FormData
): Promise<{ ok: true; foodId: string } | { ok: false; error: string }> {
  const user = await requireUserForAction();
  const parsed = createFoodSchema.safeParse({
    name: formData.get('name'),
    brand: formData.get('brand') ?? '',
    barcode: formData.get('barcode') ?? '',
    isBeverage: formData.get('isBeverage') ?? undefined,
    kcal100: formData.get('kcal100') ?? '',
    protein100: formData.get('protein100') ?? '',
    fat100: formData.get('fat100') ?? '',
    carbs100: formData.get('carbs100') ?? '',
    sugar100: formData.get('sugar100') ?? '',
    fiber100: formData.get('fiber100') ?? '',
    salt100: formData.get('salt100') ?? '',
    defaultPortionGrams: formData.get('defaultPortionGrams') ?? '',
    tagIds: formData.getAll('tagIds').map(String),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Eingabe unvollständig',
    };
  }
  const input = parsed.data;

  try {
    const [food] = await db
      .insert(foods)
      .values({
        createdByUserId: user.id,
        name: input.name,
        brand: input.brand ?? null,
        source: 'manual',
        barcode: input.barcode ?? null,
        basisUnit: input.isBeverage ? 'ml' : 'g',
        isBeverage: input.isBeverage ?? false,
        kcal100: input.kcal100 ?? null,
        protein100: input.protein100 ?? null,
        fat100: input.fat100 ?? null,
        carbs100: input.carbs100 ?? null,
        sugar100: input.sugar100 ?? null,
        fiber100: input.fiber100 ?? null,
        salt100: input.salt100 ?? null,
        defaultPortionGrams: input.defaultPortionGrams ?? null,
      })
      .returning({ id: foods.id });

    if (input.tagIds && input.tagIds.length > 0) {
      if (!(await assertTagsAllowed(user.id, input.tagIds))) {
        return { ok: false, error: 'Unbekannte Kennzeichnung' };
      }
      await db.insert(foodTags).values(
        input.tagIds.map((tagId) => ({
          foodId: food.id,
          tagId,
          source: 'manual' as const,
          confidence: 'certain' as const,
        }))
      );
    } else {
      // Nothing chosen: at least run the name through the rules so the food
      // is not completely untagged and invisible to the analysis.
      const rules = await loadRules();
      await applyDerivedTags(
        food.id,
        deriveTags(tagInputFromName(input.name), rules)
      );
    }

    revalidateFoods();
    return { ok: true, foodId: food.id };
  } catch (error) {
    const message = String(error);
    if (message.includes('food_name_uq')) {
      return { ok: false, error: 'Dieses Lebensmittel gibt es schon' };
    }
    return { ok: false, error: 'Speichern fehlgeschlagen' };
  }
}

/**
 * Manual tag edits replace the rule-derived set for that food and are marked
 * as manual, so a later rule change never overwrites them.
 */
export async function updateFoodTags(input: {
  foodId: string;
  tagIds: string[];
}): Promise<ActionResult> {
  const user = await requireUserForAction();
  const parsed = updateFoodTagsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Eingabe ungültig' };

  if (!(await assertTagsAllowed(user.id, parsed.data.tagIds))) {
    return { ok: false, error: 'Unbekannte Kennzeichnung' };
  }

  // Existence, not ownership: the library is shared, so anyone signed in may
  // correct a food's tags. That is the point of sharing it.
  const [food] = await db
    .select({ id: foods.id })
    .from(foods)
    .where(eq(foods.id, parsed.data.foodId))
    .limit(1);
  if (!food) return { ok: false, error: 'Lebensmittel nicht gefunden' };

  await db.transaction(async (tx) => {
    await tx.delete(foodTags).where(eq(foodTags.foodId, parsed.data.foodId));
    if (parsed.data.tagIds.length > 0) {
      await tx.insert(foodTags).values(
        parsed.data.tagIds.map((tagId) => ({
          foodId: parsed.data.foodId,
          tagId,
          source: 'manual' as const,
          confidence: 'certain' as const,
        }))
      );
    }
  });

  revalidateFoods();
  return { ok: true };
}

/**
 * Updating a nutrient marks the field as overridden, so a later OFF refresh
 * copies everything except the fields she corrected herself.
 */
export async function overrideFoodNutrient(input: {
  foodId: string;
  field:
    | 'kcal100'
    | 'protein100'
    | 'fat100'
    | 'carbs100'
    | 'sugar100'
    | 'fiber100'
    | 'salt100'
    | 'defaultPortionGrams';
  value: number | null;
}): Promise<ActionResult> {
  await requireUserForAction();
  const [food] = await db
    .select({ id: foods.id })
    .from(foods)
    .where(eq(foods.id, input.foodId))
    .limit(1);
  if (!food) return { ok: false, error: 'Lebensmittel nicht gefunden' };

  await db
    .update(foods)
    .set({
      [input.field]: input.value,
      overriddenFields: sql`(
        select array_agg(distinct f)
        from unnest(array_append(${foods.overriddenFields}, ${input.field})) as f
      )`,
    })
    .where(eq(foods.id, input.foodId));

  revalidateFoods();
  return { ok: true };
}

export async function listAnalysedTags() {
  await requireUserForAction();
  return db
    .select({
      id: foodTagDefs.id,
      key: foodTagDefs.key,
      labelDe: foodTagDefs.labelDe,
      category: foodTagDefs.category,
    })
    .from(foodTagDefs)
    .where(isNull(foodTagDefs.userId))
    .orderBy(foodTagDefs.sortOrder);
}
