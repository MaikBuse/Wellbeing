/**
 * Summary statistics. Pure, no dependency, deliberately small.
 *
 * Every function here has to cope with the fact that this app's scores come
 * from six chips, so the inputs are massively tied: `{0, 2, 4, 6, 8, 10}` for
 * the daily scores and `{2, 4, 6, 8, 10}` for a logged reaction. That rules out
 * anything that assumes a continuous distribution.
 */

/** Arithmetic mean. NaN-free: an empty input is null, not 0. */
export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * Median. Even counts take the mean of the two middle values — the textbook
 * definition, pinned by a test because "the lower of the two" is a common and
 * silent variation.
 */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Linear-interpolated quantile, `p` in [0, 1]. Used for the percentile
 * bootstrap interval.
 */
export function quantile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * Math.min(Math.max(p, 0), 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo]);
}

export function sampleStdDev(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values);
  if (m === null) return null;
  let ss = 0;
  for (const v of values) ss += (v - m) * (v - m);
  return Math.sqrt(ss / (values.length - 1));
}

/**
 * Standardised difference between two groups, for the balance table.
 *
 * Deliberately NOT a p-value: the balance table's job is to show how unalike
 * the two arms are, not to test whether the difference could be chance. A
 * "non-significant" imbalance in a small sample is still an imbalance that
 * confounds the estimate.
 */
export function standardisedDiff(
  a: readonly number[],
  b: readonly number[]
): number | null {
  const ma = mean(a);
  const mb = mean(b);
  if (ma === null || mb === null) return null;
  const sa = sampleStdDev(a) ?? 0;
  const sb = sampleStdDev(b) ?? 0;
  const pooled = Math.sqrt((sa * sa + sb * sb) / 2);
  if (pooled === 0) return ma === mb ? 0 : null;
  return (ma - mb) / pooled;
}

/**
 * Autocorrelation at `lag`, on the mean-centred series. Used to pick the
 * bootstrap block length from the data instead of guessing it.
 */
export function acf(values: readonly number[], lag: number): number | null {
  const n = values.length;
  if (lag < 0 || lag >= n) return null;
  const m = mean(values);
  if (m === null) return null;
  let denom = 0;
  for (const v of values) denom += (v - m) * (v - m);
  if (denom === 0) return null;
  let num = 0;
  for (let i = lag; i < n; i++) num += (values[i] - m) * (values[i - lag] - m);
  return num / denom;
}

/** Longest-run count: the number of maximal runs of `true` in a flag series. */
export function countRuns(flags: readonly boolean[]): number {
  let runs = 0;
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] && (i === 0 || !flags[i - 1])) runs++;
  }
  return runs;
}

/**
 * Jaccard overlap of two binary exposure vectors, over the days where at least
 * one is true. This is what says "gluten and yeast are the same days" — the
 * most important honesty signal in the ranking, because at ~40 exposed days
 * two tags that agree on 91 % of them cannot be told apart by any method.
 */
export function jaccard(a: readonly boolean[], b: readonly boolean[]): number {
  let both = 0;
  let either = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] && b[i]) both++;
    if (a[i] || b[i]) either++;
  }
  return either === 0 ? 0 : both / either;
}
