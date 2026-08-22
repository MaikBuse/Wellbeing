/**
 * Exposure: which tags a meal or a day carries, and how much of a measured
 * substance came with it.
 *
 * Two separate notions live here and they must not be confused:
 *
 *  - the TESTED exposure is binary, `sum(grams) >= min_dose_grams`, exactly as
 *    `food_tag_def.min_dose_grams` documents it. That is the hypothesis.
 *  - the measured DOSE in grams is descriptive. It refines the picture without
 *    adding a hypothesis, which is the whole reason it is not tested.
 */
import { measuredValue } from '@/services/off/tagRules';
import { jaccard } from '@/lib/stats/summary';
import type { TagConfidence } from './types';

/**
 * Which tags the BLS actually measures, and under which field.
 *
 * These mirror the `bls_measured` rules in `src/db/seed/tagRules.ts` one for
 * one. The field names are passed straight to `measuredValue`, so
 * `fructose_excess` (fructose beyond glucose) and `polyol` (sorbitol plus
 * mannitol) keep the single definition they already have there.
 */
export const MEASURED_FIELD_BY_TAG: Record<string, string> = {
  lactose: 'lactose',
  fructose: 'fructose_excess',
  sorbitol: 'polyol',
  alcohol: 'alcohol',
  high_sugar: 'sugar',
  omega3: 'epaDha',
  arachidonic_acid: 'arachidonic',
};

export type MeasuredPer100 = {
  lactose: number | null;
  fructose: number | null;
  glucose: number | null;
  sorbitol: number | null;
  mannitol: number | null;
  alcohol: number | null;
  sugar: number | null;
  omega3: number | null;
  epaDha: number | null;
  arachidonic: number | null;
};

export type MeasuredItem = {
  grams: number;
  /** Null for OFF and manual foods: not measured, which decides nothing. */
  per100: MeasuredPer100 | null;
  /** True when an amount was actually stated rather than defaulted. */
  hasStatedAmount: boolean;
};

export type MeasuredTotals = {
  /** Grams of the substance, per measured tag key. */
  doseByTagKey: Record<string, number>;
  totalGrams: number;
  /** Grams from foods that have measured values at all. */
  blsGrams: number;
  /** Grams whose amount was stated rather than defaulted to one portion. */
  statedGrams: number;
};

/**
 * Sum the measured dose over a set of items.
 *
 * The contract the BLS commit states, enforced here: `null` means "not
 * measured" and contributes nothing — it is NOT zero. Summing nulls as zero
 * would understate the dose systematically, and worst exactly on the days with
 * many packaged products, which is the opposite of a harmless bias. That is
 * what `blsGrams` is for: without knowing how much of the day was measurable,
 * the sum is not interpretable.
 */
export function sumMeasured(items: readonly MeasuredItem[]): MeasuredTotals {
  const doseByTagKey: Record<string, number> = {};
  let totalGrams = 0;
  let blsGrams = 0;
  let statedGrams = 0;

  for (const item of items) {
    totalGrams += item.grams;
    if (item.hasStatedAmount) statedGrams += item.grams;
    if (!item.per100) continue;
    blsGrams += item.grams;

    for (const [tagKey, field] of Object.entries(MEASURED_FIELD_BY_TAG)) {
      const per100 = measuredValue(field, item.per100);
      if (per100 === null) continue;
      doseByTagKey[tagKey] =
        (doseByTagKey[tagKey] ?? 0) + (item.grams / 100) * per100;
    }
  }

  return { doseByTagKey, totalGrams, blsGrams, statedGrams };
}

/** Minimum share of grams that must be measurable before a dose is shown. */
export const MIN_BLS_GRAMS_SHARE = 0.6;
/** Minimum share of grams whose amount was actually stated. */
export const MIN_PORTION_EVIDENCE_SHARE = 0.6;

export function share(part: number, whole: number): number {
  return whole <= 0 ? 0 : part / whole;
}

/**
 * Whether a dose statement is defensible at all.
 *
 * An unedited BLS entry is exactly 100 g, because `food_catalog` carries no
 * portion size and the copy sets none. So without stated amounts the "dose" is
 * just the per-100 g value of the catalog, carrying no information about how
 * much was eaten. Showing a curve built from that would be showing the catalog,
 * not the person.
 */
export function doseIsInterpretable(totals: MeasuredTotals): boolean {
  return (
    share(totals.blsGrams, totals.totalGrams) >= MIN_BLS_GRAMS_SHARE &&
    share(totals.statedGrams, totals.totalGrams) >= MIN_PORTION_EVIDENCE_SHARE
  );
}

/** The confidence tiers that count as exposure, given the user's setting. */
export function countedConfidences(
  countTraceExposure: boolean
): TagConfidence[] {
  return countTraceExposure
    ? ['certain', 'likely', 'trace']
    : ['certain', 'likely'];
}

/**
 * Binary exposure. `>=` on purpose: `min_dose_grams` is the line at which a day
 * counts, so the threshold value itself counts. Pinned at the boundary in
 * `db:check`, because an off-by-one here silently moves every arm.
 */
export function isExposed(grams: number, minDoseGrams: number): boolean {
  return grams >= minDoseGrams;
}

export type CollinearPair = { key: string; jaccard: number };

/**
 * Pairwise overlap of the day-level exposure vectors.
 *
 * This is the most important honesty output in the ranking. Gluten and yeast
 * co-occur in bread; whole grain and fibre co-occur by construction. At around
 * forty exposed days there is no method that can attribute an effect between
 * two tags that agree on 91 % of days, and without saying so the ranking will
 * confidently name whichever of them happens to sort first.
 */
/**
 * Below this many days touched by either factor, an overlap is arithmetic.
 *
 * Two factors each eaten on the same single day give a Jaccard of 1.0, which
 * would render "tritt an 100 % der Tage gemeinsam auf — beide lassen sich hier
 * nicht trennen". True, and vacuous, and it would fire on nearly every pair in
 * the first weeks.
 */
export const MIN_UNION_FOR_COLLINEARITY = 10;

export function collinearity(
  exposureByKey: Record<string, boolean[]>,
  threshold: number
): Record<string, CollinearPair[]> {
  const keys = Object.keys(exposureByKey);
  const out: Record<string, CollinearPair[]> = {};

  for (const key of keys) {
    const pairs: CollinearPair[] = [];
    for (const other of keys) {
      if (other === key) continue;
      let union = 0;
      const a = exposureByKey[key];
      const b = exposureByKey[other];
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] || b[i]) union++;
      }
      if (union < MIN_UNION_FOR_COLLINEARITY) continue;
      const overlap = jaccard(a, b);
      if (overlap >= threshold) pairs.push({ key: other, jaccard: overlap });
    }
    pairs.sort((a, b) => b.jaccard - a.jaccard);
    out[key] = pairs;
  }

  return out;
}

export const COLLINEARITY_THRESHOLD = 0.7;
