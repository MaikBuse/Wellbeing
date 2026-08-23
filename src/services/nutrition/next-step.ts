import type { DenseFoodRow } from '@/db/queries/nutrition';
import type { MascotFocus } from './mascot';

/**
 * One concrete thing that would help, out of what she already eats.
 *
 * Three refusals, and they are the substance of the file:
 *
 *  1. Nothing for a breached limit. The next step there is to add nothing, and
 *     a suggestion would contradict the mood that produced it.
 *  2. Nothing without a measured shortfall. `MascotFocus.remaining` is only set
 *     when the day cleared its coverage gate, so a suggestion can never be
 *     built on a gap the record does not prove.
 *  3. Nothing that barely moves. A portion covering four percent of the gap is
 *     busywork dressed as advice.
 *
 * There is also no code path to a supplement, by construction: candidates come
 * from `food`, preparations live in `medication_nutrient`. `coverage.ts` warns
 * in as many words against nudging towards a supplement on the strength of a
 * measurement gap, and the cheapest way to honour that is to have nowhere to go.
 *
 * Pure. The database read that feeds it is `nutrientDenseOwnFoods`.
 */

/** Below this share of the gap, a portion is not worth saying out loud. */
export const MIN_STEP_SHARE = 0.15;

/** What a food with no stated portion weight is assumed to be. */
export const ASSUMED_PORTION_GRAMS = 100;

export type NextStep = {
  foodId: string;
  name: string;
  /** Nutrient amount in one standard portion, in the nutrient's own unit. */
  perPortion: number;
  portionGrams: number;
  /** perPortion / remaining, capped at 1. Drives "etwa die Hälfte davon". */
  shareOfGap: number;
};

function stepFor(focus: MascotFocus, row: DenseFoodRow): NextStep | null {
  const remaining = focus.remaining;
  if (remaining === null || remaining <= 0) return null;

  const portionGrams = row.defaultPortionGrams ?? ASSUMED_PORTION_GRAMS;
  if (portionGrams <= 0) return null;

  const perPortion = (row.per100 * portionGrams) / 100;
  if (!Number.isFinite(perPortion) || perPortion <= 0) return null;

  return {
    foodId: row.foodId,
    name: row.name,
    perPortion,
    portionGrams,
    shareOfGap: Math.min(1, perPortion / remaining),
  };
}

export function rankNextStep(
  focus: MascotFocus,
  candidates: readonly DenseFoodRow[]
): NextStep | null {
  // An exceeded limit is not closed by eating something else.
  if (focus.kind !== 'gap') return null;
  // No target, no bounded gap, no number to build a sentence on.
  if (focus.target === null || focus.remaining === null) return null;

  const ranked = candidates
    .map((row) => ({ row, step: stepFor(focus, row) }))
    .filter(
      (entry): entry is { row: DenseFoodRow; step: NextStep } =>
        entry.step !== null
    )
    // Sorted here rather than trusted from SQL, so the function is total on any
    // input and the test can hand it rows in any order.
    .sort(
      (a, b) =>
        b.step.perPortion - a.step.perPortion ||
        b.row.uses - a.row.uses ||
        a.row.name.localeCompare(b.row.name, 'de')
    );

  const best = ranked.find(({ step }) => step.shareOfGap >= MIN_STEP_SHARE);
  return best?.step ?? null;
}
