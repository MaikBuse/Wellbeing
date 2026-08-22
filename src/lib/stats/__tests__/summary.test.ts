import { describe, expect, it } from 'vitest';
import {
  acf,
  countRuns,
  jaccard,
  mean,
  median,
  quantile,
  sampleStdDev,
  standardisedDiff,
} from '@/lib/stats/summary';

describe('mean / median', () => {
  it('returns null for an empty input rather than 0', () => {
    // "No data" and "zero" are different facts, and conflating them is exactly
    // how an unlogged day would become a good day.
    expect(mean([])).toBeNull();
    expect(median([])).toBeNull();
  });

  it('takes the mean of the two middle values on an even count', () => {
    expect(median([0, 2, 4, 6])).toBe(3);
    expect(median([2, 10])).toBe(6);
  });

  it('handles the tied six-value scale this app actually produces', () => {
    expect(median([4, 4, 4, 4, 6])).toBe(4);
    expect(median([0, 0, 10, 10])).toBe(5);
  });
});

describe('quantile', () => {
  it('interpolates linearly', () => {
    expect(quantile([0, 10], 0.5)).toBe(5);
    expect(quantile([0, 1, 2, 3, 4], 0.25)).toBe(1);
  });

  it('clamps outside [0, 1]', () => {
    expect(quantile([1, 2, 3], -1)).toBe(1);
    expect(quantile([1, 2, 3], 2)).toBe(3);
  });

  it('is the single value for a one-element input', () => {
    expect(quantile([7], 0.025)).toBe(7);
  });
});

describe('sampleStdDev', () => {
  it('needs two values', () => {
    expect(sampleStdDev([5])).toBeNull();
  });

  it('is zero for a constant series', () => {
    expect(sampleStdDev([4, 4, 4])).toBe(0);
  });
});

describe('standardisedDiff', () => {
  it('is 0 for identical groups', () => {
    expect(standardisedDiff([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  it('is positive when the first group is larger', () => {
    const d = standardisedDiff([6, 8, 10], [0, 2, 4]);
    expect(d).not.toBeNull();
    expect(d as number).toBeGreaterThan(0);
  });

  it('is 0 for two identical constant groups and null when they differ', () => {
    expect(standardisedDiff([4, 4], [4, 4])).toBe(0);
    expect(standardisedDiff([4, 4], [8, 8])).toBeNull();
  });
});

describe('acf', () => {
  it('is 1 at lag 0', () => {
    expect(acf([1, 2, 3, 4, 5], 0)).toBeCloseTo(1, 10);
  });

  it('is high for a slow series and near zero for alternating noise', () => {
    const slow = Array.from({ length: 200 }, (_, i) => Math.sin(i / 20));
    const alternating = Array.from({ length: 200 }, (_, i) =>
      i % 2 === 0 ? 1 : -1
    );
    expect(acf(slow, 1) as number).toBeGreaterThan(0.9);
    expect(acf(alternating, 1) as number).toBeCloseTo(-1, 1);
  });

  it('is null for a constant series, where correlation is undefined', () => {
    expect(acf([3, 3, 3, 3], 1)).toBeNull();
  });
});

describe('countRuns', () => {
  it('counts maximal runs, not days', () => {
    // Anti-clustering: seven exposed days in one block is one observation of a
    // week of bread, not seven independent ones.
    expect(countRuns([true, true, true, false, true])).toBe(2);
    expect(countRuns([false, false])).toBe(0);
    expect(countRuns([true])).toBe(1);
  });
});

describe('jaccard', () => {
  it('is 1 for identical vectors and 0 for disjoint ones', () => {
    expect(jaccard([true, false, true], [true, false, true])).toBe(1);
    expect(jaccard([true, false], [false, true])).toBe(0);
  });

  it('is 0 when neither vector is ever true', () => {
    expect(jaccard([false, false], [false, false])).toBe(0);
  });

  it('measures overlap over the union, not the length', () => {
    // 2 shared out of 3 touched days.
    expect(jaccard([true, true, false, false], [true, true, true, false])).toBeCloseTo(
      2 / 3,
      10
    );
  });
});
