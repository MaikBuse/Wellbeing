'use server';

import { and, eq, inArray, isNull, or } from 'drizzle-orm';
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
  NUTRIENT_FIELDS,
  barcodeSchema,
  createFoodSchema,
  catalogIdSchema,
  enteredValues,
  resolveNutrientBasis,
  updateFoodNutrientsSchema,
  updateFoodTagsSchema,
  type NutrientField,
} from '@/lib/validation/food';
import type { Per100 } from '@/lib/nutrition';
import type { z } from 'zod';
import type { ActionResult } from './meals';

/**
 * Payloads are the schemas' INPUT types, so the numeric fields stay the German
 * strings the form actually holds ("12,5") and `germanNumber` does the parsing
 * in one place.
 */
export type CreateFoodPayload = z.input<typeof createFoodSchema>;
export type UpdateFoodNutrientsPayload = z.input<
  typeof updateFoodNutrientsSchema
>;

/**
 * The fields the user actually put a value in.
 *
 * This is what `overridden_fields` means — "she has asserted a value here" — and
 * not "this value changed". A rescale that happens to round-trip to the same
 * number is still a value she confirmed, and a diff would leave it unmarked for
 * the next refresh to overwrite, which is the exact failure the column exists to
 * prevent. A field left EMPTY is not marked: refusing a future refresh the right
 * to fill a gap she never filled herself would be the opposite of the point.
 */
function assertedFields(values: Per100): NutrientField[] {
  return NUTRIENT_FIELDS.filter((field) => values[field] !== null);
}

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

/**
 * Takes a plain object, not `FormData`.
 *
 * The nutrient fields live inside a `Disclosure`, and `Disclosure` unmounts its
 * children — so collapsing the panel used to empty every nutrient key out of the
 * `FormData` and the food was created with no nutrients at all, under a success
 * toast. Holding the whole form in component state and sending it as an object
 * removes that class of loss instead of papering over one instance of it.
 */
export async function createFood(
  payload: CreateFoodPayload
): Promise<{ ok: true; foodId: string } | { ok: false; error: string }> {
  const user = await requireUserForAction();
  const parsed = createFoodSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Eingabe unvollständig',
    };
  }
  const input = parsed.data;

  const entered = enteredValues(input);
  const basis = resolveNutrientBasis({
    values: entered,
    kind: input.basisKind,
    basisAmount: input.basisAmount ?? null,
    portionGrams: input.defaultPortionGrams ?? null,
    unit: input.isBeverage ? 'ml' : 'g',
  });
  if (!basis.ok) return { ok: false, error: basis.error };

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
        ...basis.values,
        defaultPortionGrams: input.defaultPortionGrams ?? null,
        overriddenFields: assertedFields(entered),
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
 * Correct the whole nutrient set at once, on whatever reference amount the label
 * states them.
 *
 * The whole set and not one field at a time: changing the reference amount
 * changes all eight values together, so eight calls would be neither atomic nor
 * able to see that sugar now exceeds carbohydrates. The replaced single-field
 * version also had a live bug waiting for exactly this generalisation —
 * `array_agg` over zero rows is NULL, which a one-element `array_append` can
 * never hit but a zero-or-more append can, and `overridden_fields` is NOT NULL.
 * The set is merged in TypeScript here, off the row that was already read.
 *
 * A correction applies from now on. Nutrients on `meal_item` are a frozen
 * snapshot, so nothing already logged moves — which is the asymmetry to tags,
 * where a correction is meant to reach backwards.
 *
 * `defaultPortionGrams` is deliberately NOT writable here, even though it is
 * what the "je 1 Portion" basis divides by. It is not a display field: it is the
 * multiplier `resolveGrams` applies to every logged item, `food_portion` carries
 * a second copy of it that quick-add prefers, and "Wie gestern" recomputes from
 * it. Rescaling nutrients and silently moving tomorrow's portion size are two
 * different decisions and must not share a save button.
 */
export async function updateFoodNutrients(
  payload: UpdateFoodNutrientsPayload
): Promise<ActionResult> {
  await requireUserForAction();
  const parsed = updateFoodNutrientsSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Eingabe ungültig',
    };
  }
  const input = parsed.data;

  // Existence, not ownership: the library is shared, exactly as for tags.
  const [food] = await db
    .select({
      id: foods.id,
      basisUnit: foods.basisUnit,
      defaultPortionGrams: foods.defaultPortionGrams,
      overriddenFields: foods.overriddenFields,
    })
    .from(foods)
    .where(eq(foods.id, input.foodId))
    .limit(1);
  if (!food) return { ok: false, error: 'Lebensmittel nicht gefunden' };

  const entered = enteredValues(input);
  const basis = resolveNutrientBasis({
    values: entered,
    kind: input.basisKind,
    basisAmount: input.basisAmount ?? null,
    portionGrams: food.defaultPortionGrams,
    unit: food.basisUnit === 'ml' ? 'ml' : 'g',
  });
  if (!basis.ok) return { ok: false, error: basis.error };

  const overridden = new Set([
    ...food.overriddenFields,
    ...assertedFields(entered),
  ]);

  await db
    .update(foods)
    .set({ ...basis.values, overriddenFields: [...overridden].sort() })
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
