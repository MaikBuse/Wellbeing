'use server';

import { and, desc, eq, sql } from 'drizzle-orm';
import { requireUserWithSettings } from '@/auth.helpers';
import { db } from '@/db';
import { foodPortions, foodTags, foods, mealItems, meals } from '@/db/schema';
import { nutrientsForGrams, resolveGrams } from '@/lib/nutrition';
import { revalidateDay } from '@/lib/revalidate';
import { DEFAULT_MEAL_TIMES, type MealSlotKey } from '@/lib/scales';
import {
  addDays,
  instantForLogDateTime,
  toLogDate,
  todayLogDate,
  type LogDate,
  type TimeOfDay,
} from '@/lib/time';
import {
  addMealItemSchema,
  copyMealSchema,
  createMealSchema,
  quickAddSchema,
  setMealTimeSchema,
  updateMealItemSchema,
} from '@/lib/validation/meal';

export type ActionResult = { ok: true } | { ok: false; error: string };

async function resolveItemWrite(
  foodId: string,
  quantity: number,
  unit: 'g' | 'ml' | 'piece' | 'portion',
  portionId: string | null
) {
  // The food library is shared, so there is no ownership to check here. What
  // has to be scoped is the meal the item is attached to, and every caller
  // does that.
  const [food] = await db
    .select()
    .from(foods)
    .where(eq(foods.id, foodId))
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

/**
 * When a meal actually happened.
 *
 * The clock is only the right answer for today. Quick-add used to stamp
 * `new Date()` unconditionally *and* derive the log date from it, so anything
 * entered while looking at another day silently landed on today — the day being
 * viewed was used for the lookup but never for the write. Building the instant
 * from the viewed day fixes both halves at once: the stored log date is still
 * derived from the instant (clients never send a day assignment), and it now
 * equals the requested day by construction.
 */
function resolveOccurredAt(
  logDate: LogDate,
  slot: MealSlotKey,
  settings: { timeZone: string; dayStartHour: number }
): Date {
  const now = new Date();
  if (logDate === todayLogDate(settings.timeZone, settings.dayStartHour, now)) {
    return now;
  }
  return instantForLogDateTime(
    logDate,
    DEFAULT_MEAL_TIMES[slot],
    settings.timeZone,
    settings.dayStartHour
  );
}

/**
 * Serialises the read-then-insert that decides whether a slot already has a
 * meal.
 *
 * There is deliberately no unique index on (user, log_date, slot) — a second
 * breakfast and a split dinner are real. That leaves the lookup in quickAddFood
 * unprotected under READ COMMITTED: two taps in the same moment both see an
 * empty slot and both create a meal, which shows up as one time group per tap.
 * An advisory lock is the cheapest fix that does not forbid the legitimate case.
 */
async function lockSlot(
  tx: typeof db,
  userId: string,
  logDate: LogDate,
  slot: string
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`${userId}|${logDate}|${slot}`}))`
  );
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
    // The schema has always accepted this; not reading it meant an explicit
    // time was silently replaced by "now".
    occurredAt: formData.get('occurredAt') ?? undefined,
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

  revalidateDay();
  return { ok: true };
}

/**
 * The three-tap path: tap the slot, tap a food chip, done. Creates the meal on
 * the fly if the slot is still empty and adds the food with its default
 * portion. Anything slower than this does not survive six months of daily use.
 */
export async function quickAddFood(input: {
  slot: MealSlotKey;
  logDate: LogDate;
  foodId: string;
}): Promise<ActionResult> {
  const { user, settings } = await requireUserWithSettings();
  const parsed = quickAddSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Eingabe unvollständig' };
  const { slot, logDate, foodId } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      const scoped = tx as unknown as typeof db;
      await lockSlot(scoped, user.id, logDate, slot);

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
        const occurredAt = resolveOccurredAt(logDate, slot, settings);
        const [created] = await tx
          .insert(meals)
          .values({
            userId: user.id,
            slot,
            occurredAt,
            // Still derived server-side: the client sends the day it is looking
            // at and, at most, a wall-clock time — never a day assignment. The
            // instant is built in the user's own zone, so this comes back out as
            // the requested day.
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

  revalidateDay();
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

  revalidateDay();
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

  revalidateDay();
  return { ok: true };
}

export async function deleteMealItem(
  mealItemId: string
): Promise<ActionResult> {
  const { user } = await requireUserWithSettings();
  const [item] = await db
    .select({ id: mealItems.id, mealId: mealItems.mealId })
    .from(mealItems)
    .innerJoin(meals, eq(meals.id, mealItems.mealId))
    .where(and(eq(mealItems.id, mealItemId), eq(meals.userId, user.id)))
    .limit(1);
  if (!item) return { ok: false, error: 'Eintrag nicht gefunden' };

  await db.transaction(async (tx) => {
    await tx.delete(mealItems).where(eq(mealItems.id, mealItemId));

    // An emptied meal is not a meal. Left behind it still printed its time on
    // the slot, and it stayed the row that later quick-adds attached to — so a
    // deleted breakfast kept dictating the time of the next one. Reactions are
    // kept: symptom_entry.meal_id is ON DELETE SET NULL, so they survive as
    // meal-less entries rather than being lost.
    const [{ remaining }] = await tx
      .select({ remaining: sql<number>`count(*)::int` })
      .from(mealItems)
      .where(eq(mealItems.mealId, item.mealId));
    if (remaining === 0) {
      await tx.delete(meals).where(eq(meals.id, item.mealId));
    }
  });

  revalidateDay();
  return { ok: true };
}

/**
 * Corrects when a meal happened.
 *
 * The time is a wall-clock time on the day the meal is filed under, so a change
 * across the day boundary genuinely moves the meal to the neighbouring day. The
 * caller is told, because the entry then leaves the screen it was edited on.
 */
export async function setMealTime(input: {
  mealId: string;
  timeOfDay: TimeOfDay;
}): Promise<{ ok: true; logDate: LogDate } | { ok: false; error: string }> {
  const { user, settings } = await requireUserWithSettings();
  const parsed = setMealTimeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Ungültig' };
  }

  const [meal] = await db
    .select({ id: meals.id, logDate: meals.logDate })
    .from(meals)
    .where(and(eq(meals.id, parsed.data.mealId), eq(meals.userId, user.id)))
    .limit(1);
  if (!meal) return { ok: false, error: 'Mahlzeit nicht gefunden' };

  const occurredAt = instantForLogDateTime(
    meal.logDate,
    parsed.data.timeOfDay,
    settings.timeZone,
    settings.dayStartHour
  );
  const logDate = toLogDate(
    occurredAt,
    settings.timeZone,
    settings.dayStartHour
  );

  await db
    .update(meals)
    .set({ occurredAt, logDate })
    .where(eq(meals.id, parsed.data.mealId));

  revalidateDay();
  return { ok: true, logDate };
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
  revalidateDay();
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
    // Same rule as quick-add: "now" is only right for today. Copying Sunday's
    // breakfast onto Saturday used to stamp it with the current time.
    const occurredAt = resolveOccurredAt(targetLogDate, slot, settings);
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

  revalidateDay();
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
      item.quantity,
      item.unit,
      item.portionId
    );
    await db
      .update(mealItems)
      .set({ grams, ...nutrients, nutrientsComputedAt: new Date() })
      .where(eq(mealItems.id, item.id));
  }

  revalidateDay();
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
