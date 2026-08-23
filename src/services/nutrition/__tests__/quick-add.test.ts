import { describe, expect, it } from 'vitest';
import type { NutrientKey } from '@/lib/nutrients';
import { sumDayNutrients } from '../aggregate';
import { nutritionDay } from '../score';
import { MIN_PORTION_EVIDENCE_SHARE } from '@/services/analysis/exposure';
import { item, maxTarget, minTarget, quickAddItem } from './fixtures';
import type { TargetValue } from '../targets/types';

/**
 * The path the app actually takes, end to end: aggregate → assess → what the
 * day screen would print.
 *
 * `quickAddFood` is the only add path in the UI and it writes `quantity 1`,
 * `unit 'portion'`, `portionId null` for any food without a default measure —
 * which every BLS copy and every hand-made food is. `hasStatedAmount` is then
 * false, `portionEvidenceShare` is 0, and `evaluateTarget` withholds every
 * verdict. That part is intended (see the comment in `coverage.ts`).
 *
 * What was NOT intended is that it also withheld the numbers. The unit tests
 * elsewhere all start from `fixtures.ts`, whose defaults are `hasStatedAmount:
 * true` and `portionEvidenceShare: 1` — the opposite of production on both
 * counts — so the day screen could ship with four permanently empty bars and a
 * green suite. These tests assert the production shape.
 */

const TARGETS: ReadonlyMap<NutrientKey, TargetValue> = new Map<
  NutrientKey,
  TargetValue
>([
  ['protein', minTarget(90)],
  ['fiber', minTarget(30)],
  ['calcium', minTarget(1000, { unit: 'mg' })],
]);

const SALT_ONLY: ReadonlyMap<NutrientKey, TargetValue> = new Map<
  NutrientKey,
  TargetValue
>([['salt', maxTarget(6)]]);

/** Breakfast and dinner, both quick-added, both without a stated amount. */
function quickAddDay() {
  return sumDayNutrients('2026-08-20', [
    quickAddItem({
      grams: 100,
      slot: 'breakfast',
      snapshot: { protein: 12, fiber: 6 },
    }),
    quickAddItem({
      grams: 200,
      slot: 'dinner',
      snapshot: { protein: 30, fiber: 4 },
    }),
  ]);
}

describe('Quick-Add ohne Mengenangabe', () => {
  it('drops the portion evidence to zero', () => {
    const day = quickAddDay();
    expect(day.totalGrams).toBe(300);
    expect(day.statedGrams).toBe(0);
    expect(day.portionEvidenceShare).toBe(0);
    expect(day.portionEvidenceShare).toBeLessThan(MIN_PORTION_EVIDENCE_SHARE);
  });

  it('withholds the verdict but keeps the number', () => {
    const assessed = nutritionDay(quickAddDay(), TARGETS, { isFlare: false });
    const protein = assessed.nutrients.find((n) => n.key === 'protein')!;

    // No verdict — the amounts are guesses, so "short of the target" is not
    // something the data supports.
    expect(protein.status).toBe('unknown');
    expect(protein.scored).toBe(false);
    // ...but 42 g were measured, and that number is worth printing. What kind
    // of number it is, is the next test.
    expect(protein.total.total).toBe(42);
    expect(protein.showValue).toBe(true);
    expect(protein.judged).toBe(true);
  });

  it('still says nothing about a nutrient with no measurement at all', () => {
    const assessed = nutritionDay(quickAddDay(), TARGETS, { isFlare: false });
    const calcium = assessed.nutrients.find((n) => n.key === 'calcium')!;

    // No `per100`, so calcium was never measured. This is the one case that is
    // genuinely "zu wenig Messwerte", and it must stay distinguishable.
    expect(calcium.total.total).toBeNull();
    expect(calcium.status).toBe('unknown');
    expect(calcium.showValue).toBe(false);
  });

  it('calls the number an estimate, never a floor', () => {
    const assessed = nutritionDay(quickAddDay(), TARGETS, { isFlare: false });
    const protein = assessed.nutrients.find((n) => n.key === 'protein')!;

    // A missing MEASUREMENT can only understate. A missing AMOUNT can go either
    // way — the 100 g a catalog copy defaults to may be more than what was
    // eaten. So no "mindestens" in front of this one.
    expect(protein.isLowerBound).toBe(false);
  });

  it('withholds even an exceeded limit while the amounts are guesses', () => {
    const day = sumDayNutrients('2026-08-20', [
      quickAddItem({ grams: 300, slot: 'lunch', snapshot: { salt: 9 } }),
    ]);
    const assessed = nutritionDay(day, SALT_ONLY, { isFlare: false });
    const salt = assessed.nutrients.find((n) => n.key === 'salt')!;

    // The counterpart to the coverage rule, and the reason the portion gate is
    // its own gate: "over the limit" is proven by a measured part only while
    // the part is real. 9 g resolved from a defaulted 100 g portion proves
    // nothing in either direction.
    expect(salt.status).toBe('unknown');
    expect(salt.showValue).toBe(true);
  });

  it('gives a real verdict once the amounts and the catalog link are there', () => {
    const day = sumDayNutrients('2026-08-20', [
      item({
        grams: 100,
        slot: 'breakfast',
        snapshot: { protein: 40 },
        per100: { calcium: 120 },
      }),
      item({
        grams: 200,
        slot: 'dinner',
        snapshot: { protein: 60 },
        per100: { calcium: 90 },
      }),
    ]);
    const assessed = nutritionDay(day, TARGETS, { isFlare: false });
    const protein = assessed.nutrients.find((n) => n.key === 'protein')!;

    expect(day.portionEvidenceShare).toBe(1);
    expect(day.blsGramsShare).toBe(1);
    expect(protein.status).toBe('met');
    expect(protein.isLowerBound).toBe(false);
    expect(protein.scored).toBe(true);
  });
});
