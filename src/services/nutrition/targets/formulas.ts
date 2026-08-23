/**
 * The arithmetic behind the derived targets. Pure, no context object, no
 * database — everything here is checkable against a hand-computed number.
 */

/** WHO/FAO physical activity levels, one per `activity_level` enum value. */
export const PAL_FACTOR = {
  sedentary: 1.2,
  light: 1.4,
  moderate: 1.6,
  active: 1.8,
  very_active: 1.9,
} as const;

export type ActivityLevel = keyof typeof PAL_FACTOR;

export const PAL_LABEL_DE: Record<ActivityLevel, string> = {
  sedentary: 'fast nur liegend oder sitzend',
  light: 'überwiegend sitzend',
  moderate: 'sitzend, mit Wegen und Stehen',
  active: 'überwiegend stehend oder gehend',
  very_active: 'körperlich schwere Arbeit',
};

/** A weight-loss target is the maintenance need minus this share. */
export const WEIGHT_LOSS_DEFICIT = 0.15;
/** A weight-gain target is the maintenance need plus this share. */
export const WEIGHT_GAIN_SURPLUS = 0.1;

/**
 * Resting energy expenditure, Mifflin-St Jeor.
 *
 * Named by the Academy of Nutrition and Dietetics as the standard predictive
 * equation; it lands within 10 % of measured REE for roughly seven people in
 * ten. It is a guess with a good track record, not a measurement, and the UI
 * says so.
 */
export function restingEnergyKcal(input: {
  sex: 'female' | 'male';
  weightKg: number;
  heightCm: number;
  ageYears: number;
}): number {
  const base =
    10 * input.weightKg + 6.25 * input.heightCm - 5 * input.ageYears;
  return input.sex === 'male' ? base + 5 : base - 161;
}

/**
 * Daily energy target.
 *
 * The deficit is a share rather than a flat 500 kcal, and it never takes the
 * target below the resting expenditure: a target under REE is not a diet plan,
 * it is an instruction to under-eat, and this app has no business issuing one.
 */
export function energyTargetKcal(input: {
  sex: 'female' | 'male';
  weightKg: number;
  heightCm: number;
  ageYears: number;
  activityLevel: ActivityLevel;
  goal: 'maintain' | 'lose' | 'gain';
}): number {
  const ree = restingEnergyKcal(input);
  const maintenance = ree * PAL_FACTOR[input.activityLevel];
  if (input.goal === 'lose') {
    return Math.max(ree, maintenance * (1 - WEIGHT_LOSS_DEFICIT));
  }
  if (input.goal === 'gain') return maintenance * (1 + WEIGHT_GAIN_SURPLUS);
  return maintenance;
}

/** Energy per gram, for turning an energy-percent target into grams. */
export const KCAL_PER_G = { protein: 4, fat: 9, carbs: 4 } as const;

/**
 * Grams of a macronutrient that make up `share` of `energyKcal`.
 *
 * Note which energy this is called with: the TARGET, never the energy actually
 * eaten. Against the eaten energy a 3500 kcal day would raise its own saturated
 * fat limit, which is the same self-lifting-baseline mistake `computeDeviations`
 * avoids by excluding the day from its own median window.
 */
export function gramsForEnergyShare(
  energyKcal: number,
  share: number,
  macro: keyof typeof KCAL_PER_G
): number {
  return (energyKcal * share) / KCAL_PER_G[macro];
}

/** Age in whole years on a given log date, from a birth year alone. */
export function ageFromBirthYear(
  birthYear: number | null,
  logDate: string
): number | null {
  if (birthYear === null) return null;
  const year = Number(logDate.slice(0, 4));
  if (!Number.isFinite(year)) return null;
  const age = year - birthYear;
  return age >= 0 && age < 130 ? age : null;
}

/**
 * The body weight a weight-scaled target should use, per day.
 *
 * A 28-day median, INCLUSIVE of the day itself — deliberately unlike
 * `trailingMedian` in raIndex.ts, which excludes it. There the exclusion stops
 * a spike from lifting its own baseline; body weight has no such feedback, and
 * an exclusive window would make the very first weighing unusable for the day it
 * was taken on. Do not "fix" this into the other shape.
 *
 * Median, not mean: day-to-day weight swings by more than a kilo on water
 * alone, and the protein target should not follow that.
 */
export function referenceWeightSeries(
  weights: readonly (number | null)[],
  windowDays = 28
): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < weights.length; i++) {
    const from = Math.max(0, i - windowDays + 1);
    const window: number[] = [];
    for (let j = from; j <= i; j++) {
      const value = weights[j];
      if (value !== null && Number.isFinite(value)) window.push(value);
    }
    out.push(window.length === 0 ? null : median(window));
  }
  return out;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}
