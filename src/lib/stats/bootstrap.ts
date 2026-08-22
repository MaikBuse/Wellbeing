/**
 * Stationary (geometric) circular block bootstrap over days.
 *
 * iid resampling is the wrong null for this data and that is the whole premise:
 * RA flares last weeks, so consecutive days are strongly dependent and drawing
 * days independently would shrink every interval until noise looked like
 * evidence. `null.test.ts` demonstrates exactly that failure on purpose.
 *
 * Blocks are geometric rather than fixed-length so the resample distribution
 * does not depend on where block boundaries happen to fall, and circular so the
 * first and last L days are not underrepresented. Wrapping December onto
 * January is acceptable here because the outcome is a *local* deviation from a
 * trailing median, not a level.
 */
import { geometricLength, randomInt, type Rng } from '@/lib/random';
import { acf } from './summary';

/** Bounds on the block length, in days. */
export const MIN_BLOCK_DAYS = 7;
export const MAX_BLOCK_DAYS = 28;
const ACF_THRESHOLD = 0.2;
const ACF_MAX_LAG = 30;

/**
 * Pick the expected block length from the series itself: twice the first lag at
 * which autocorrelation has decayed below 0.2.
 *
 * The floor of 7 is not arbitrary — the eating week is the shortest real cycle
 * in this data, and a block shorter than that would break up exactly the
 * dependence it exists to preserve. The ceiling of 28 keeps enough effectively
 * independent blocks at a few hundred days.
 *
 * When autocorrelation has NOT decayed by lag 30 the fallback is the ceiling,
 * not the floor. A series still correlated at a month is the most dependent
 * case there is, so it needs the longest blocks; falling back to 7 there would
 * under-preserve the dependence and produce intervals that are too narrow —
 * the exact failure this whole module exists to prevent.
 */
export type BlockLengthBasis = 'acf' | 'no_decay' | 'too_short';

export function estimateBlockLength(series: readonly number[]): {
  blockLength: number;
  acfLagUsed: number | null;
  basis: BlockLengthBasis;
} {
  // Fewer than three points cannot say anything about autocorrelation. The
  // ceiling is still the conservative choice, but the reason must not be
  // reported as "measured and did not decay" — that would be a claim about
  // something never measured.
  if (series.length < 3) {
    return {
      blockLength: MAX_BLOCK_DAYS,
      acfLagUsed: null,
      basis: 'too_short',
    };
  }
  const maxLag = Math.min(ACF_MAX_LAG, series.length - 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    const r = acf(series, lag);
    if (r === null) break;
    if (Math.abs(r) < ACF_THRESHOLD) {
      return {
        blockLength: clampBlock(2 * lag),
        acfLagUsed: lag,
        basis: 'acf',
      };
    }
  }
  return { blockLength: MAX_BLOCK_DAYS, acfLagUsed: null, basis: 'no_decay' };
}

function clampBlock(value: number): number {
  return Math.min(MAX_BLOCK_DAYS, Math.max(MIN_BLOCK_DAYS, value));
}

/**
 * One resampled day-index sequence of length `n`.
 *
 * Returned as an Int32Array and reused across every tag in the same iteration:
 * that is a 40x saving, and it is also statistically preferable, because the
 * tags then share their resampling noise and their intervals are directly
 * comparable.
 */
export function stationaryBlockIndices(
  n: number,
  expectedBlockLength: number,
  rng: Rng
): Int32Array {
  const out = new Int32Array(n);
  let filled = 0;
  while (filled < n) {
    let index = randomInt(rng, n);
    const length = geometricLength(rng, expectedBlockLength);
    for (let i = 0; i < length && filled < n; i++) {
      out[filled++] = index;
      index = index + 1 === n ? 0 : index + 1;
    }
  }
  return out;
}

/**
 * Plain iid resampling. Exported ONLY so `null.test.ts` can show that it
 * manufactures findings on autocorrelated noise where the block bootstrap does
 * not. Never use it in the pipeline.
 */
export function iidIndices(n: number, rng: Rng): Int32Array {
  const out = new Int32Array(n);
  for (let i = 0; i < n; i++) out[i] = randomInt(rng, n);
  return out;
}
