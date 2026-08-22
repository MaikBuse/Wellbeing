'use server';

import { and, desc, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { requireUserWithSettings } from '@/auth.helpers';
import { db } from '@/db';
import { foodPortions, foodTags, foods, mealItems, meals } from '@/db/schema';
import { nutrientsForGrams, resolveGrams } from '@/lib/nutrition';
import { addDays, toLogDate, type LogDate } from '@/lib/time';
import {
  addMealItemSchema,
  copyMealSchema,
  createMealSchema,
  quickAddSchema,
  updateMealItemSchema,
} from '@/lib/validation/meal';

export type ActionResult = { ok: true } | { ok: false; error: string };

async function resolveItemWrite(
  foodId: string,
  userId: string,
  quantity: number,
  unit: 'g' | 'ml' | 'piece' | 'portion',
  portionId: string | null
) {
  const [food] = await db
    .select()
    .from(foods)
    .where(and(eq(foods.id, foodId), eq(foods.userId, userId)))
    .limit(1);
  if (!food) throw new Error('Lebensmittel nicht gefunden');

  let portionGrams: number | null = null;
  if (portionId) {
    const [portion] = await db
      .select()
      .from(foodPortions)
      .where(
        and(eq(foodPortions.id, portionId), eq(foodPortions.foodId, foodId))
      )
      .limit(1);
    portionGrams = portion?.grams ?? null;
  }

  const grams = resolveGrams({
    quantity,
    unit,
    portionGrams,
    defaultPortionGrams: food.defaultPortionGrams,
    densityGPerMl: food.densityGPerMl,
  });

  // Nutrients are frozen here on purpose: a later OFF refresh or correction
  // must not rewrite the history of what she ate.
  const nutrients = nutrientsForGrams(food, grams);
  return { grams, nutrients };
}

/** Bumps the picker counters in the same transaction as the meal write. */
async function touchFood(tx: typeof db, foodId: string) {
  await tx
    .update(foods)
    .set({ useCount: sql`${foods.useCount} + 1`, lastUsedAt: new Date() })
    .where(eq(foods.id, foodId));
}

export async function createMeal(formData: FormData): Promise<ActionResult> {
  const { user, settings } = await requireUserWithSettings();
  const parsed = createMealSchema.safeParse({
    slot: formData.get('slot'),
    note: formData.get('note') ?? '',
  });
  if (!parsed.success) return { ok: false, error: 'Eingabe unvollständig' };

  const occurredAt = parsed.data.occurredAt ?? new Date();
  await db.insert(meals).values({
    userId: user.id,
    slot: parsed.data.slot,
    occurredAt,
    logDate: toLogDate(occurredAt, settings.timeZone, settings.dayStartHour),
    note: parsed.data.note ?? null,
  });

  revalidatePath('/');
  return { ok: true };
}

/**
 * The three-tap path: tap the slot, tap a food chip, done. Creates the meal on
 * the fly if the slot is still empty and adds the food with its default
 * portion. Anything slower than this does not survive six months of daily use.
 */
export async function quickAddFood(input: {
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink';
  logDate: LogDate;
  foodId: string;
}): Promise<ActionResult> {
  const { user, settings } = await requireUserWithSettings();
  const parsed = quickAddSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Eingabe unvollständig' };
  const { slot, logDate, foodId } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: meals.id })
        .from(meals)
        .where(
          and(
            eq(meals.userId, user.id),
            eq(meals.logDate, logDate),
            eq(meals.slot, slot)
          )
        )
        .orderBy(desc(meals.occurredAt))
        .limit(1);

      let mealId = existing?.id;
      if (!mealId) {
        const occurredAt = new Date();
        const [created] = await tx
          .insert(meals)
          .values({
            userId: user.id,
            slot,
            occurredAt,
            // Derived server-side: the client never sends a log date, so a
            // device with a wrong clock cannot poison the dataset.
            logDate: toLogDate(
              occurredAt,
              settings.timeZone,
              settings.dayStartHour
            ),
          })
          .returning({ id: meals.id });
        mealId = created.id;
      }

      const [defaultPortion] = await tx
        .select({ id: foodPortions.id })
        .from(foodPortions)
        .where(
          and(eq(foodPortions.foodId, foodId), eq(foodPortions.isDefault, true))
        )
        .limit(1);

      const { grams, nutrients } = await resolveItemWrite(
        foodId,
        user.id,
        1,
        'portion',
        defaultPortion?.id ?? null
      );

      const [{ nextSort }] = await tx
        .select({
          nextSort: sql<number>`coalesce(max(${mealItems.sortOrder}), -1) + 1`,
        })
        .from(mealItems)
        .where(eq(mealItems.mealId, mealId));

      await tx.insert(mealItems).values({
        mealId,
        foodId,
        quantity: 1,
        unit: 'portion',
        portionId: defaultPortion?.id ?? null,
        grams,
        ...nutrients,
        sortOrder: nextSort,
      });

      await touchFood(tx as unknown as typeof db, foodId);
    });
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : 'Speichern fehlgeschlagen',
    };
  }

  revalidatePath('/');
  return { ok: true };
}

export async function addMealItem(formData: FormData): Promise<ActionResult> {
  const { user } = await requireUserWithSettings();
  const parsed = addMealItemSchema.safeParse({
    mealId: formData.get('mealId'),
    foodId: formData.get('foodId'),
    quantity: formData.get('quantity') ?? '1',
    unit: formData.get('unit') ?? 'portion',
    portionId: formData.get('portionId') || null,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Ungültig' };
  }

  const [meal] = await db
    .select({ id: meals.id })
    .from(meals)
    .where(and(eq(meals.id, parsed.data.mealId), eq(meals.userId, user.id)))
    .limit(1);
  if (!meal) return { ok: false, error: 'Mahlzeit nicht gefunden' };

  try {
    const { grams, nutrients } = await resolveItemWrite(
      parsed.data.foodId,
      user.id,
      parsed.data.quantity,
      parsed.data.unit,
      parsed.data.portionId ?? null
    );
    await db.transaction(async (tx) => {
      const [{ nextSort }] = await tx
        .select({
          nextSort: sql<number>`coalesce(max(${mealItems.sortOrder}), -1) + 1`,
        })
        .from(mealItems)
        .where(eq(mealItems.mealId, parsed.data.mealId));
      await tx.insert(mealItems).values({
        mealId: parsed.data.mealId,
        foodId: parsed.data.foodId,
        quantity: parsed.data.quantity,
        unit: parsed.data.unit,
        portionId: parsed.data.portionId ?? null,
        grams,
        ...nutrients,
        sortOrder: nextSort,
      });
      await touchFood(tx as unknown as typeof db, parsed.data.foodId);
    });
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : 'Speichern fehlgeschlagen',
    };
  }

  revalidatePath('/');
  return { ok: true };
}

export async function updateMealItem(
  formData: FormData
): Promise<ActionResult> {
  const { user } = await requireUserWithSettings();
  const parsed = updateMealItemSchema.safeParse({
    mealItemId: formData.get('mealItemId'),
    quantity: formData.get('quantity'),
    unit: formData.get('unit') ?? 'portion',
    portionId: formData.get('portionId') || null,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Ungültig' };
  }

  const [item] = await db
    .select({ id: mealItems.id, foodId: mealItems.foodId })
    .from(mealItems)
    .innerJoin(meals, eq(meals.id, mealItems.mealId))
    .where(
      and(eq(mealItems.id, parsed.data.mealItemId), eq(meals.userId, user.id))
    )
    .limit(1);
  if (!item) return { ok: false, error: 'Eintrag nicht gefunden' };

  const { grams, nutrients } = await resolveItemWrite(
    item.foodId,
    user.id,
    parsed.data.quantity,
    parsed.data.unit,
    parsed.data.portionId ?? null
  );

  await db
    .update(mealItems)
    .set({
      quantity: parsed.data.quantity,
      unit: parsed.data.unit,
      portionId: parsed.data.portionId ?? null,
      grams,
      ...nutrients,
      nutrientsComputedAt: new Date(),
    })
    .where(eq(mealItems.id, parsed.data.mealItemId));

  revalidatePath('/');
  return { ok: true };
}

export async function deleteMealItem(
  mealItemId: string
): Promise<ActionResult> {
  const { user } = await requireUserWithSettings();
  const [item] = await db
    .select({ id: mealItems.id })
    .from(mealItems)
    .innerJoin(meals, eq(meals.id, mealItems.mealId))
    .where(and(eq(mealItems.id, mealItemId), eq(meals.userId, user.id)))
    .limit(1);
  if (!item) return { ok: false, error: 'Eintrag nicht gefunden' };

  await db.delete(mealItems).where(eq(mealItems.id, mealItemId));
  revalidatePath('/');
  return { ok: true };
}

export async function deleteMeal(mealId: string): Promise<ActionResult> {
  const { user } = await requireUserWithSettings();
  const result = await db
    .delete(meals)
    .where(and(eq(meals.id, mealId), eq(meals.userId, user.id)))
    .returning({ id: meals.id });
  if (result.length === 0) {
    return { ok: false, error: 'Mahlzeit nicht gefunden' };
  }
  revalidatePath('/');
  return { ok: true };
}

/**
 * "Wie gestern" — copies yesterday's same slot. One tap, and it is the single
 * biggest time saver for someone who eats the same breakfast most days.
 */
export async function copyMealFromYesterday(input: {
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink';
  targetLogDate: LogDate;
}): Promise<ActionResult> {
  const { user, settings } = await requireUserWithSettings();
  const parsed = copyMealSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Eingabe unvollständig' };
  const { slot, targetLogDate } = parsed.data;
  const sourceDate = addDays(targetLogDate, -1);

  const [source] = await db
    .select({ id: meals.id })
    .from(meals)
    .where(
      and(
        eq(meals.userId, user.id),
        eq(meals.logDate, sourceDate),
        eq(meals.slot, slot)
      )
    )
    .orderBy(desc(meals.occurredAt))
    .limit(1);
  if (!source) {
    return { ok: false, error: 'Gestern ist für diesen Slot nichts erfasst' };
  }

  const sourceItems = await db
    .select()
    .from(mealItems)
    .where(eq(mealItems.mealId, source.id));
  if (sourceItems.length === 0) {
    return { ok: false, error: 'Gestern ist für diesen Slot nichts erfasst' };
  }

  await db.transaction(async (tx) => {
    const occurredAt = new Date();
    const [created] = await tx
      .insert(meals)
      .values({
        userId: user.id,
        slot,
        occurredAt,
        logDate: toLogDate(
          occurredAt,
          settings.timeZone,
          settings.dayStartHour
        ),
      })
      .returning({ id: meals.id });

    // Nutrients are recomputed rather than copied, so a correction made since
    // yesterday is picked up for the new entry.
    for (const [index, item] of sourceItems.entries()) {
      const { grams, nutrients } = await resolveItemWrite(
        item.foodId,
        user.id,
        item.quantity,
        item.unit,
        item.portionId
      );
      await tx.insert(mealItems).values({
        mealId: created.id,
        foodId: item.foodId,
        quantity: item.quantity,
        unit: item.unit,
        portionId: item.portionId,
        grams,
        ...nutrients,
        sortOrder: index,
      });
      await touchFood(tx as unknown as typeof db, item.foodId);
    }
  });

  revalidatePath('/');
  return { ok: true };
}

/** Re-freezes nutrients for one meal — the explicit alternative to silent drift. */
export async function recomputeMealNutrients(
  mealId: string
): Promise<ActionResult> {
  const { user } = await requireUserWithSettings();
  const [meal] = await db
    .select({ id: meals.id })
    .from(meals)
    .where(and(eq(meals.id, mealId), eq(meals.userId, user.id)))
    .limit(1);
  if (!meal) return { ok: false, error: 'Mahlzeit nicht gefunden' };

  const items = await db
    .select()
    .from(mealItems)
    .where(eq(mealItems.mealId, mealId));

  for (const item of items) {
    const { grams, nutrients } = await resolveItemWrite(
      item.foodId,
      user.id,
      item.quantity,
      item.unit,
      item.portionId
    );
    await db
      .update(mealItems)
      .set({ grams, ...nutrients, nutrientsComputedAt: new Date() })
      .where(eq(mealItems.id, item.id));
  }

  revalidatePath('/');
  return { ok: true };
}

/** Tags are NOT snapshotted, so this is read live wherever it is shown. */
export async function tagsForFood(foodId: string) {
  await requireUserWithSettings();
  return db
    .select({ tagId: foodTags.tagId, confidence: foodTags.confidence })
    .from(foodTags)
    .where(eq(foodTags.foodId, foodId));
}
