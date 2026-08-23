import {
  CATALOG_UNIT_FACTOR,
  NUTRIENT_KEYS,
  NUTRIENT_META,
  type NutrientKey,
} from '@/lib/nutrients';
import { MAIN_MEAL_SLOTS, type MealSlotKey } from '@/lib/scales';
import type { LogDate } from '@/lib/time';
import type {
  DayNutrients,
  NutrientItemRow,
  NutrientTotal,
  SupplementContribution,
} from './types';

/**
 * Day totals, per nutrient, with the coverage that qualifies them.
 *
 * Two rules carry this file, and both come straight from the BLS contract in
 * CLAUDE.md.
 *
 * FIRST: `null` is "not measured" and contributes nothing. It is not zero.
 * Summing nulls as zero would understate every total, and worst exactly on the
 * days with many packaged products — the opposite of a harmless bias. What
 * makes the total interpretable again is `coveredGrams`.
 *
 * SECOND: coverage is per NUTRIENT, not per day, and it is weighted by GRAMS.
 * The BLS is unevenly complete — arachidonic acid is missing for about a fifth
 * of entries, lactose for well under one percent — so a single day-level
 * "measurable share" would drag a 98 % calcium figure down to the level of a
 * 41 % iodine one. And five grams of spice with unknown iodine is not the same
 * gap as three hundred grams of stew.
 *
 * NOTE ON ROUNDING: nothing here rounds. `round2` from lib/nutrition.ts must not
 * be used on micronutrients — vitamin D at 0.045 µg/100 g over a 15 g portion is
 * 0.00675 µg, which rounds to 0.01 and overstates that item by nearly half.
 * Over ten items that compounds into a day total that is simply wrong. Sums are
 * carried at full precision and rounded once, for display, with
 * `NUTRIENT_META[key].decimals`.
 */

function emptyTotal(): NutrientTotal {
  return {
    fromFood: null,
    fromSupplement: 0,
    total: null,
    coveredGrams: 0,
    coverage: 0,
  };
}

export function emptyDayNutrients(logDate: LogDate): DayNutrients {
  const totals = {} as Record<NutrientKey, NutrientTotal>;
  for (const key of NUTRIENT_KEYS) totals[key] = emptyTotal();
  return {
    logDate,
    totals,
    totalGrams: 0,
    statedGrams: 0,
    portionEvidenceShare: 0,
    blsGrams: 0,
    blsGramsShare: 0,
    mainSlots: 0,
    itemsWithOverriddenMacros: 0,
  };
}

export function sumDayNutrients(
  logDate: LogDate,
  items: readonly NutrientItemRow[],
  supplements: readonly SupplementContribution[] = []
): DayNutrients {
  const day = emptyDayNutrients(logDate);
  const slots = new Set<MealSlotKey>();

  for (const item of items) {
    day.totalGrams += item.grams;
    if (item.hasStatedAmount) day.statedGrams += item.grams;
    if (item.per100 !== null) day.blsGrams += item.grams;
    if (item.wasOverridden) day.itemsWithOverriddenMacros++;
    slots.add(item.slot);

    for (const key of NUTRIENT_KEYS) {
      const meta = NUTRIENT_META[key];
      if (meta.source.kind === 'derived') continue;

      const measured =
        meta.source.kind === 'snapshot'
          ? amountFromSnapshot(item, key)
          : amountFromCatalog(item, key);
      if (measured === null) continue;

      const total = day.totals[key];
      total.fromFood = (total.fromFood ?? 0) + measured;
      total.coveredGrams += item.grams;
    }
  }

  for (const contribution of supplements) {
    if (contribution.logDate !== logDate) continue;
    const total = day.totals[contribution.nutrientKey];
    if (!total) continue;
    total.fromSupplement += contribution.amount;
  }

  for (const key of NUTRIENT_KEYS) {
    const total = day.totals[key];
    total.coverage = share(total.coveredGrams, day.totalGrams);
    total.total = combine(total.fromFood, total.fromSupplement);
  }

  day.portionEvidenceShare = share(day.statedGrams, day.totalGrams);
  day.blsGramsShare = share(day.blsGrams, day.totalGrams);
  day.mainSlots = [...slots].filter((slot) =>
    (MAIN_MEAL_SLOTS as readonly MealSlotKey[]).includes(slot)
  ).length;

  applyDerived(day);
  return day;
}

/** A snapshot value is already the amount for the logged portion. */
function amountFromSnapshot(
  item: NutrientItemRow,
  key: NutrientKey
): number | null {
  const value = item.snapshot[key];
  return value === null || value === undefined || Number.isNaN(value)
    ? null
    : value;
}

/**
 * A catalog value is per 100 of the food's basis unit and has to be scaled.
 *
 * `per100 === null` means the food has no catalog link at all, which is a
 * different gap from a linked food whose individual value was never measured —
 * both contribute nothing, both lower the coverage, and neither becomes a zero.
 */
function amountFromCatalog(
  item: NutrientItemRow,
  key: NutrientKey
): number | null {
  if (item.per100 === null) return null;
  const per100 = item.per100[key];
  if (per100 === null || per100 === undefined || Number.isNaN(per100)) {
    return null;
  }
  const factor = CATALOG_UNIT_FACTOR[key] ?? 1;
  return (item.grams / 100) * per100 * factor;
}

/**
 * The n-6 : n-3 ratio, which has no column of its own.
 *
 * It is only as good as the weaker of its two parts, so it inherits the LOWER
 * of their coverages. A ratio built from well-measured omega-6 and barely
 * measured omega-3 is not a well-measured ratio.
 */
function applyDerived(day: DayNutrients): void {
  const omega6 = day.totals.omega6;
  const omega3 = day.totals.omega3;
  const ratio = day.totals.n6n3Ratio;

  ratio.coverage = Math.min(omega6.coverage, omega3.coverage);
  ratio.coveredGrams = Math.min(omega6.coveredGrams, omega3.coveredGrams);

  if (
    omega6.total === null ||
    omega3.total === null ||
    omega3.total <= 0 ||
    ratio.coverage <= 0
  ) {
    ratio.fromFood = null;
    ratio.total = null;
    return;
  }
  ratio.fromFood = omega6.total / omega3.total;
  ratio.total = ratio.fromFood;
}

/**
 * A supplement counts even when nothing was measured from food.
 *
 * That is the honest reading: two thousand IU of vitamin D were taken whether
 * or not the day's meals were recorded well enough to measure anything.
 */
function combine(fromFood: number | null, fromSupplement: number): number | null {
  if (fromFood === null) return fromSupplement > 0 ? fromSupplement : null;
  return fromFood + fromSupplement;
}

export function share(part: number, whole: number): number {
  return whole <= 0 ? 0 : part / whole;
}

/** Round once, at the edge, in the nutrient's own precision. */
export function roundForDisplay(value: number, key: NutrientKey): number {
  const factor = 10 ** NUTRIENT_META[key].decimals;
  return Math.round(value * factor) / factor;
}
