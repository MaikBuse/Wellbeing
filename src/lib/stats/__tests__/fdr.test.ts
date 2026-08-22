import { describe, expect, it } from 'vitest';
import { benjaminiHochberg } from '@/lib/stats/fdr';

describe('benjaminiHochberg', () => {
  it('handles an empty input', () => {
    expect(benjaminiHochberg([], 0.1)).toEqual({ qValues: [], rejected: [], m: 0 });
  });

  it('matches the worked textbook example', () => {
    // Benjamini & Hochberg 1995, the classic four-hypothesis illustration.
    const p = [0.01, 0.02, 0.03, 0.04];
    const { qValues } = benjaminiHochberg(p, 0.05);
    expect(qValues[0]).toBeCloseTo(0.04, 10);
    expect(qValues[1]).toBeCloseTo(0.04, 10);
    expect(qValues[2]).toBeCloseTo(0.04, 10);
    expect(qValues[3]).toBeCloseTo(0.04, 10);
  });

  it('never lets q exceed 1', () => {
    const { qValues } = benjaminiHochberg([0.9, 0.95, 0.99], 0.1);
    for (const q of qValues) expect(q).toBeLessThanOrEqual(1);
  });

  it('is monotone: a larger p never gets a smaller q', () => {
    const p = [0.001, 0.008, 0.02, 0.04, 0.2, 0.5, 0.9];
    const { qValues } = benjaminiHochberg(p, 0.1);
    for (let i = 1; i < qValues.length; i++) {
      expect(qValues[i]).toBeGreaterThanOrEqual(qValues[i - 1] - 1e-12);
    }
  });

  it('keeps q aligned with the input order, not the sorted order', () => {
    const { qValues } = benjaminiHochberg([0.9, 0.001], 0.1);
    expect(qValues[1]).toBeLessThan(qValues[0]);
  });

  it('rejects exactly those at or below alpha', () => {
    const { qValues, rejected } = benjaminiHochberg([0.001, 0.5], 0.1);
    for (let i = 0; i < qValues.length; i++) {
      expect(rejected[i]).toBe(qValues[i] <= 0.1);
    }
  });

  it('corrects by the number of hypotheses TESTED, not a larger family', () => {
    // The detail people get wrong in both directions: padding m with tags that
    // failed a case-count gate would bury the real findings, because those
    // hypotheses could not possibly have produced a discovery.
    const tested = [0.01, 0.02];
    const small = benjaminiHochberg(tested, 0.1);
    const padded = benjaminiHochberg([...tested, 0.9, 0.95, 0.99], 0.1);

    expect(small.m).toBe(2);
    expect(padded.m).toBe(5);
    expect(padded.qValues[0]).toBeGreaterThan(small.qValues[0]);
  });

  it('is more forgiving than Bonferroni beyond the first rank', () => {
    // At rank 1 the two coincide (q = m*p). BH's gain is that the k-th smallest
    // is divided by k, which is what keeps a real second and third finding
    // alive across 42 tags instead of demanding each clear alpha/42 alone.
    const p = Array.from({ length: 42 }, (_, i) => (i < 5 ? 0.002 * (i + 1) : 0.6));
    const { qValues } = benjaminiHochberg(p, 0.1);

    expect(qValues[0]).toBeCloseTo(42 * 0.002, 10);
    // Rank 5: 42 * 0.010 / 5 = 0.084, far below Bonferroni's 42 * 0.010 = 0.42.
    expect(qValues[4]).toBeCloseTo(0.084, 10);
    expect(qValues[4]).toBeLessThan(0.01 * 42);
  });
});
