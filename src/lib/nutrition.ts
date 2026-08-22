/**
 * Nutrient maths. Values on `food` are per 100 g (or per 100 ml for drinks);
 * `meal_item` stores the resolved amount for the logged portion.
 */

export type Per100 = {
  kcal100: number | null;
  protein100: number | null;
  fat100: number | null;
  satFat100: number | null;
  carbs100: number | null;
  sugar100: number | null;
  fiber100: number | null;
  salt100: number | null;
};

export type Nutrients = {
  kcal: number | null;
  proteinG: number | null;
  fatG: number | null;
  satFatG: number | null;
  carbsG: number | null;
  sugarG: number | null;
  fiberG: number | null;
  saltG: number | null;
};

export const EMPTY_NUTRIENTS: Nutrients = {
  kcal: null,
  proteinG: null,
  fatG: null,
  satFatG: null,
  carbsG: null,
  sugarG: null,
  fiberG: null,
  saltG: null,
};

function scale(value: number | null, factor: number): number | null {
  if (value === null || Number.isNaN(value)) return null;
  return round2(value * factor);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Nutrients for `grams` of a food whose values are per 100. */
export function nutrientsForGrams(food: Per100, grams: number): Nutrients {
  const factor = grams / 100;
  return {
    kcal: scale(food.kcal100, factor),
    proteinG: scale(food.protein100, factor),
    fatG: scale(food.fat100, factor),
    satFatG: scale(food.satFat100, factor),
    carbsG: scale(food.carbs100, factor),
    sugarG: scale(food.sugar100, factor),
    fiberG: scale(food.fiber100, factor),
    saltG: scale(food.salt100, factor),
  };
}

/**
 * The inverse of `nutrientsForGrams`: label values stated per `reference` units
 * turned into the per-100 values the `food` row stores.
 *
 * `reference` is a PLAIN NUMBER in the food's own basis unit — grams for solids,
 * millilitres for drinks. Never pass a density through here. `resolveGrams`
 * converts ml to grams and `nutrientsForGrams` then divides by 100 as if the
 * result were grams; the two only cancel because `densityGPerMl` is always 1
 * today. Feeding a density into this function would make every drink with a real
 * density wrong in a way nothing in the app displays.
 *
 * Not exactly invertible, and it cannot be: the result is stored at scale 2, so
 * a round trip through `nutrientsForGrams` is off by at most
 * `0.005 * reference / 100 + 0.005`. Exact when `100 / reference` is a positive
 * integer, which covers 1, 100 and every other reference worth pinning in a
 * test. For a 400 g ready meal the worst case is 0.02 g — invisible next to the
 * whole-gram rounding the screens already do.
 *
 * Throws for a reference that is zero, negative or non-finite. That is not
 * defensive noise: `numeric(10,2)` REJECTS Infinity but silently ACCEPTS NaN,
 * and Postgres sorts NaN above every number, so a `>= 0` check would not catch
 * it. The one value that must never reach a column is the one a division by zero
 * produces.
 */
export function per100FromReference(entered: Per100, reference: number): Per100 {
  if (!Number.isFinite(reference) || reference <= 0) {
    throw new Error('per100FromReference: reference must be finite and > 0');
  }
  return nutrientsPer100(entered, 100 / reference);
}

function nutrientsPer100(values: Per100, factor: number): Per100 {
  return {
    kcal100: scale(values.kcal100, factor),
    protein100: scale(values.protein100, factor),
    fat100: scale(values.fat100, factor),
    satFat100: scale(values.satFat100, factor),
    carbs100: scale(values.carbs100, factor),
    sugar100: scale(values.sugar100, factor),
    fiber100: scale(values.fiber100, factor),
    salt100: scale(values.salt100, factor),
  };
}

export type PortionInput = {
  quantity: number;
  unit: 'g' | 'ml' | 'piece' | 'portion';
  /** Grams of the chosen named portion, if one was picked. */
  portionGrams?: number | null;
  /** Fallback default portion of the food. */
  defaultPortionGrams?: number | null;
  densityGPerMl?: number | null;
};

/**
 * Resolve what she entered into grams.
 *
 * An approximate portion that actually gets logged beats a precise one that
 * doesn't, so grams are never mandatory in the UI: the fallback chain is
 * chosen portion -> food default -> 100.
 */
export function resolveGrams(input: PortionInput): number {
  const { quantity, unit } = input;
  if (unit === 'g') return round2(quantity);
  if (unit === 'ml') return round2(quantity * (input.densityGPerMl ?? 1));
  const per = input.portionGrams ?? input.defaultPortionGrams ?? 100;
  return round2(quantity * per);
}

export function sumNutrients(items: Nutrients[]): Nutrients {
  const total = { ...EMPTY_NUTRIENTS };
  for (const item of items) {
    for (const key of Object.keys(total) as (keyof Nutrients)[]) {
      const value = item[key];
      if (value === null) continue;
      total[key] = round2((total[key] ?? 0) + value);
    }
  }
  return total;
}

/**
 * OFF values are crowd-sourced, rounded and sometimes plain wrong, so nothing
 * is shown to the calorie.
 *
 * Small values are rounded to 1 rather than to 10: a cup of black coffee has
 * about 4 kcal, and printing "0 kcal" for something that does have calories is
 * worse than printing a slightly false precision.
 */
export function roundKcal(value: number): number {
  if (value === 0) return 0;
  if (value < 25) return Math.max(1, Math.round(value));
  return Math.round(value / 10) * 10;
}

export function formatKcal(value: number | null): string {
  if (value === null) return '–';
  return `${roundKcal(value)} kcal`;
}

/**
 * Two decimals, not whole grams.
 *
 * `Math.round` used to be fine when nutrients could only be read. It is not once
 * they can be entered and corrected: typing 8,5 g protein and being shown "9 g"
 * reads as a bug in the app. On salt it was simply wrong — 0,4 g per 100 g
 * printed as "0 g", and 0,4 against 1,1 is a difference people watch for.
 */
export function formatGrams(value: number | null, digits = 2): string {
  if (value === null) return '–';
  return `${formatGermanNumber(value, digits)} g`;
}

/** German decimal input: Number('12,5') is NaN. */
export function parseGermanNumber(input: string): number | null {
  const normalised = input.trim().replace(/\s/g, '').replace(',', '.');
  if (normalised === '') return null;
  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}

export function formatGermanNumber(value: number | null, digits = 1): string {
  if (value === null) return '';
  return value.toLocaleString('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}
