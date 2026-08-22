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
export function formatKcal(value: number | null): string {
  if (value === null) return '–';
  if (value === 0) return '0 kcal';
  if (value < 25) return `${Math.max(1, Math.round(value))} kcal`;
  return `${Math.round(value / 10) * 10} kcal`;
}

export function formatGrams(value: number | null): string {
  if (value === null) return '–';
  return `${Math.round(value)} g`;
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
