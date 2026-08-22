/**
 * Circular rotation test.
 *
 * The bootstrap interval and the p-value answer different questions and need
 * different machinery. The interval says "how precisely is this effect
 * determined"; the p-value says "could this alignment be coincidence". For a
 * time series the clean null is not "shuffle the days" — that destroys the
 * autocorrelation and would make almost anything look surprising — but "keep
 * both series exactly as they are and slide one past the other".
 *
 * Rotation preserves the autocorrelation of both series exactly and destroys
 * only their alignment, which is precisely the thing under test.
 */
import { randomInt, type Rng } from '@/lib/random';

export type RotationResult = {
  observed: number;
  pValue: number;
  resamples: number;
};

/**
 * `statFor(offset)` must compute the statistic with the exposure series rotated
 * by `offset` days; offset 0 is the observed data. Two-sided.
 *
 * The `+1` in numerator and denominator is the standard finite-sample
 * correction: with R resamples a p-value can never honestly be 0, and reporting
 * 0 would invite exactly the over-reading this whole design tries to avoid.
 */
export function rotationTest(
  statFor: (offset: number) => number | null,
  n: number,
  resamples: number,
  rng: Rng
): RotationResult | null {
  const observed = statFor(0);
  if (observed === null || !Number.isFinite(observed)) return null;

  const target = Math.abs(observed);
  let atLeastAsExtreme = 0;
  let used = 0;

  for (let r = 0; r < resamples; r++) {
    // 1..n-1: an offset of 0 is the observed data, not a null draw.
    const offset = 1 + randomInt(rng, Math.max(1, n - 1));
    const value = statFor(offset);
    if (value === null || !Number.isFinite(value)) continue;
    used++;
    if (Math.abs(value) >= target) atLeastAsExtreme++;
  }

  return {
    observed,
    pValue: (1 + atLeastAsExtreme) / (1 + used),
    resamples: used,
  };
}

/**
 * The p-value from a set of already-computed null statistics.
 *
 * Split out so a caller can share ONE set of rotation offsets across many
 * hypotheses — which is both far cheaper and statistically preferable, since
 * the hypotheses then face the same null draws and their p-values are directly
 * comparable.
 */
export function rotationPValue(
  observed: number,
  nullValues: readonly number[]
): number {
  const target = Math.abs(observed);
  let atLeastAsExtreme = 0;
  for (const value of nullValues) {
    if (Math.abs(value) >= target) atLeastAsExtreme++;
  }
  return (1 + atLeastAsExtreme) / (1 + nullValues.length);
}
