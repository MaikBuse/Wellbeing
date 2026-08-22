import { describe, expect, it } from 'vitest';
import { sfc32 } from '@/lib/random';
import {
  MAX_BLOCK_DAYS,
  MIN_BLOCK_DAYS,
  estimateBlockLength,
  iidIndices,
  stationaryBlockIndices,
} from '@/lib/stats/bootstrap';
import { mean } from '@/lib/stats/summary';

/** AR(1) series with the given autocorrelation. */
function ar1(rho: number, n: number, seed: string): number[] {
  const rng = sfc32(seed);
  const out: number[] = [];
  let previous = 0;
  for (let i = 0; i < n; i++) {
    // Box-Muller from two uniforms.
    const u1 = Math.max(rng(), Number.MIN_VALUE);
    const u2 = rng();
    const noise = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    previous = rho * previous + Math.sqrt(1 - rho * rho) * noise;
    out.push(previous);
  }
  return out;
}

describe('estimateBlockLength', () => {
  it('rises with autocorrelation', () => {
    // The point of estimating rather than hardcoding: a person whose flares
    // last a month needs longer blocks than one whose days are independent.
    const lengths = [0.0, 0.5, 0.8, 0.95].map(
      (rho) => estimateBlockLength(ar1(rho, 600, `rho-${rho}`)).blockLength
    );
    for (let i = 1; i < lengths.length; i++) {
      expect(lengths[i]).toBeGreaterThanOrEqual(lengths[i - 1]);
    }
    expect(lengths[3]).toBeGreaterThan(lengths[0]);
  });

  it('never leaves the [7, 28] band', () => {
    for (const rho of [0, 0.3, 0.6, 0.9, 0.99]) {
      const { blockLength } = estimateBlockLength(ar1(rho, 600, `band-${rho}`));
      expect(blockLength).toBeGreaterThanOrEqual(MIN_BLOCK_DAYS);
      expect(blockLength).toBeLessThanOrEqual(MAX_BLOCK_DAYS);
    }
  });

  it('falls back to the CEILING when autocorrelation never decays', () => {
    // Still correlated at a month is the most dependent case there is, so it
    // needs the longest blocks. Falling back to the floor here would hand back
    // intervals that are too narrow on exactly the hardest data.
    const slow = Array.from({ length: 600 }, (_, i) => Math.sin(i / 200));
    const { blockLength, acfLagUsed } = estimateBlockLength(slow);
    expect(blockLength).toBe(MAX_BLOCK_DAYS);
    expect(acfLagUsed).toBeNull();
  });
});

describe('stationaryBlockIndices', () => {
  it('returns exactly n indices, all in range', () => {
    const rng = sfc32('shape');
    const idx = stationaryBlockIndices(120, 10, rng);
    expect(idx).toHaveLength(120);
    for (const i of idx) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(120);
    }
  });

  it('preserves the series mean in expectation', () => {
    const series = ar1(0.7, 300, 'mean-preserve');
    const rng = sfc32('mean-preserve-rng');
    const resampleMeans: number[] = [];
    for (let b = 0; b < 400; b++) {
      const idx = stationaryBlockIndices(series.length, 14, rng);
      let sum = 0;
      for (const i of idx) sum += series[i];
      resampleMeans.push(sum / idx.length);
    }
    const observed = mean(series) as number;
    const resampled = mean(resampleMeans) as number;
    expect(Math.abs(resampled - observed)).toBeLessThan(0.05);
  });

  it('samples the edges as often as the middle, because it wraps', () => {
    // Without the circular wrap the first and last L days would be
    // underrepresented, which biases exactly the newest data.
    const n = 60;
    const rng = sfc32('wrap');
    const counts = new Array(n).fill(0);
    for (let b = 0; b < 3000; b++) {
      for (const i of stationaryBlockIndices(n, 10, rng)) counts[i]++;
    }
    const expected = (3000 * n) / n;
    const edges = counts[0] + counts[n - 1];
    const middle = counts[n >> 1] + counts[(n >> 1) + 1];
    // Both pairs should sit near 2x the per-index expectation.
    expect(edges / (2 * expected)).toBeGreaterThan(0.85);
    expect(edges / (2 * expected)).toBeLessThan(1.15);
    expect(middle / (2 * expected)).toBeGreaterThan(0.85);
    expect(middle / (2 * expected)).toBeLessThan(1.15);
  });

  it('draws contiguous runs, unlike iid resampling', () => {
    // The defining property: the blocks are what carry the day-to-day
    // dependence into the resample.
    const rng = sfc32('contiguity');
    const blocked = stationaryBlockIndices(200, 20, rng);
    const iid = iidIndices(200, sfc32('contiguity-iid'));

    const consecutive = (idx: Int32Array) => {
      let hits = 0;
      for (let i = 1; i < idx.length; i++) {
        if (idx[i] === idx[i - 1] + 1) hits++;
      }
      return hits;
    };

    expect(consecutive(blocked)).toBeGreaterThan(consecutive(iid) + 100);
  });
});
