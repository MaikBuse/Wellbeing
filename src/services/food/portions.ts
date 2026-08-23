/**
 * The write side of a food's own measures — "1 Stück" = 58 g.
 *
 * Separate from the server actions for the same reason as
 * `copyCatalogEntryToLibrary`: a Server Action cannot run outside a request
 * scope, and the interesting parts here are constraints that only a real
 * Postgres can prove — a partial unique index that a naive two-row update
 * collides with, and a delete that must leave logged meals standing. `db:check`
 * exercises these directly. The actions stay the authentication boundary;
 * nothing in this file authenticates anything, so nothing here may be reachable
 * from a route.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { foodPortions, foods } from '@/db/schema';
import {
  portionGramsEntry,
  resolvePortionGrams,
  type PortionGramsMode,
} from '@/lib/validation/food';

export type PortionResult = { ok: true } | { ok: false; error: string };

export type PortionAmountInput = {
  mode: PortionGramsMode;
  amount?: number | null;
  count?: number | null;
  totalAmount?: number | null;
  kcalPerUnit?: number | null;
};

/**
 * Keep `food.default_portion_grams` equal to the default `food_portion`.
 *
 * The two were independent, and that is a trap with no visible symptom:
 * `resolveNutrientBasis` anchors „je 1 Portion“ to `default_portion_grams`,
 * while `resolveGrams` prefers the chosen portion row. Enter an egg's nutrients
 * per piece against a 100 g anchor and then log it against a 58 g „Stück“, and
 * every number is off by 1,7x with nothing on screen disagreeing with anything
 * else.
 *
 * The rule, in one place: a food WITH portion rows mirrors its default one; a
 * food WITHOUT any keeps whatever the create form put there. That second half is
 * why the column is not simply dropped — every manually created food has a
 * portion weight and no portion row.
 *
 * Must run inside the caller's transaction, after the mutation.
 */
export async function syncDefaultPortion(
  tx: typeof db,
  foodId: string
): Promise<void> {
  const rows = await tx
    .select({
      id: foodPortions.id,
      grams: foodPortions.grams,
      isDefault: foodPortions.isDefault,
    })
    .from(foodPortions)
    .where(eq(foodPortions.foodId, foodId))
    .orderBy(foodPortions.sortOrder, foodPortions.labelDe);

  if (rows.length === 0) return;

  let current = rows.find((row) => row.isDefault);
  if (!current) {
    // The default was just deleted. Promote rather than leave the food without
    // one: `quickAddFood` looks for `is_default` and would otherwise fall back
    // to `default_portion_grams ?? 100` for a food that plainly has measures.
    current = rows[0];
    await tx
      .update(foodPortions)
      .set({ isDefault: true })
      .where(eq(foodPortions.id, current.id));
  }

  await tx
    .update(foods)
    .set({ defaultPortionGrams: current.grams })
    .where(eq(foods.id, foodId));
}

/** The food a measure hangs off, with what the kcal conversion mode needs. */
async function foodForPortion(foodId: string) {
  const [food] = await db
    .select({ id: foods.id, kcal100: foods.kcal100, basisUnit: foods.basisUnit })
    .from(foods)
    .where(eq(foods.id, foodId))
    .limit(1);
  if (!food) return null;
  return {
    id: food.id,
    kcal100: food.kcal100,
    unit: food.basisUnit === 'ml' ? ('ml' as const) : ('g' as const),
  };
}

/**
 * Postgres names the index it refused on, and the raw name is not a sentence
 * anyone should have to read in a toast.
 *
 * Read off `constraint_name`, and off the CAUSE chain rather than the error
 * itself: drizzle wraps a driver error in one whose `message` is the failing SQL
 * plus the parameters. Matching on that message looks like it works — the query
 * text is right there — but the constraint name is not in it, so every violation
 * would fall through to the generic sentence. It would also put the parameters,
 * which for this app are food names, into anything that logs the message.
 */
function writeError(error: unknown): string {
  let constraint: string | undefined;
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    const named = (e as { constraint_name?: string }).constraint_name;
    if (named) {
      constraint = named;
      break;
    }
  }
  if (constraint === 'food_portion_label_uq') {
    return 'Diese Einheit gibt es bei diesem Lebensmittel schon.';
  }
  if (constraint === 'food_portion_grams_positive') {
    return 'Das Gewicht muss größer als 0 sein.';
  }
  return 'Speichern fehlgeschlagen';
}

export async function addPortion(
  foodId: string,
  labelDe: string,
  amount: PortionAmountInput
): Promise<PortionResult> {
  const food = await foodForPortion(foodId);
  if (!food) return { ok: false, error: 'Lebensmittel nicht gefunden' };

  const resolved = resolvePortionGrams(portionGramsEntry(amount, food));
  if (!resolved.ok) return { ok: false, error: resolved.error };

  try {
    await db.transaction(async (tx) => {
      const [{ nextSort, existing }] = await tx
        .select({
          nextSort: sql<number>`coalesce(max(${foodPortions.sortOrder}), 90) + 10`,
          existing: sql<number>`count(*)::int`,
        })
        .from(foodPortions)
        .where(eq(foodPortions.foodId, foodId));

      await tx.insert(foodPortions).values({
        foodId,
        labelDe,
        grams: resolved.grams,
        // The first measure a food gets becomes its default, so adding „Stück“
        // to an egg is the whole job — no second tap to say it is the one
        // quick-add should count in.
        isDefault: existing === 0,
        // smallint. A food with 3200 measures is not a case worth a column
        // widening, but an overflow mid-transaction would be a 500.
        sortOrder: Math.min(nextSort, 32000),
      });

      await syncDefaultPortion(tx as unknown as typeof db, foodId);
    });
  } catch (error) {
    return { ok: false, error: writeError(error) };
  }
  return { ok: true };
}

export async function editPortion(
  portionId: string,
  labelDe: string,
  amount: PortionAmountInput
): Promise<PortionResult> {
  const [portion] = await db
    .select({ id: foodPortions.id, foodId: foodPortions.foodId })
    .from(foodPortions)
    .where(eq(foodPortions.id, portionId))
    .limit(1);
  if (!portion) return { ok: false, error: 'Einheit nicht gefunden' };

  const food = await foodForPortion(portion.foodId);
  if (!food) return { ok: false, error: 'Lebensmittel nicht gefunden' };

  const resolved = resolvePortionGrams(portionGramsEntry(amount, food));
  if (!resolved.ok) return { ok: false, error: resolved.error };

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(foodPortions)
        .set({ labelDe, grams: resolved.grams })
        .where(eq(foodPortions.id, portionId));
      await syncDefaultPortion(tx as unknown as typeof db, portion.foodId);
    });
  } catch (error) {
    return { ok: false, error: writeError(error) };
  }
  return { ok: true };
}

/**
 * Remove a measure.
 *
 * Deliberately not guarded against being in use. `meal_item.portion_id` is
 * ON DELETE SET NULL, and the grams and nutrients on that row are a frozen
 * snapshot — nothing already logged moves or loses a value, only the name it was
 * chosen under goes away. Refusing the delete would instead leave a typo in a
 * catalog every account shares.
 */
export async function removePortion(portionId: string): Promise<PortionResult> {
  const [portion] = await db
    .select({ id: foodPortions.id, foodId: foodPortions.foodId })
    .from(foodPortions)
    .where(eq(foodPortions.id, portionId))
    .limit(1);
  if (!portion) return { ok: false, error: 'Einheit nicht gefunden' };

  await db.transaction(async (tx) => {
    await tx.delete(foodPortions).where(eq(foodPortions.id, portion.id));
    await syncDefaultPortion(tx as unknown as typeof db, portion.foodId);
  });
  return { ok: true };
}

export async function makePortionDefault(
  portionId: string
): Promise<PortionResult> {
  const [portion] = await db
    .select({ id: foodPortions.id, foodId: foodPortions.foodId })
    .from(foodPortions)
    .where(eq(foodPortions.id, portionId))
    .limit(1);
  if (!portion) return { ok: false, error: 'Einheit nicht gefunden' };

  await db.transaction(async (tx) => {
    // Two statements, in this order, because `food_portion_default_uq` is a
    // partial unique INDEX and indexes are not deferrable: setting the new flag
    // before clearing the old one collides with the row being replaced.
    await tx
      .update(foodPortions)
      .set({ isDefault: false })
      .where(
        and(
          eq(foodPortions.foodId, portion.foodId),
          eq(foodPortions.isDefault, true)
        )
      );
    await tx
      .update(foodPortions)
      .set({ isDefault: true })
      .where(eq(foodPortions.id, portion.id));
    await syncDefaultPortion(tx as unknown as typeof db, portion.foodId);
  });
  return { ok: true };
}
