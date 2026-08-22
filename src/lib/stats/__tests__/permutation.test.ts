import { describe, expect, it } from 'vitest';
import { sfc32 } from '@/lib/random';
import { rotationTest } from '@/lib/stats/permutation';

describe('rotationTest', () => {
  it('reports the statistic at offset 0 as the observation', () => {
    const result = rotationTest((offset) => (offset === 0 ? 3.5 : 0), 100, 50, sfc32('a'));
    expect(result?.observed).toBe(3.5);
  });

  it('never returns a p-value of 0 or above 1', () => {
    // With R resamples a p-value cannot honestly be 0, and printing 0 would
    // invite exactly the over-reading this design avoids.
    const result = rotationTest(
      (offset) => (offset === 0 ? 1e9 : 0),
      100,
      200,
      sfc32('b')
    );
    expect(result?.pValue).toBeGreaterThan(0);
    expect(result?.pValue).toBeLessThanOrEqual(1);
  });

  it('is near 1 when the observation is unremarkable', () => {
    // Every rotation is as extreme as the observation, so nothing happened.
    const result = rotationTest(() => 1, 100, 200, sfc32('c'));
    expect(result?.pValue).toBeCloseTo(1, 5);
  });

  it('is small when only the true alignment is extreme', () => {
    const result = rotationTest(
      (offset) => (offset === 0 ? 10 : 0.1),
      300,
      500,
      sfc32('d')
    );
    expect(result?.pValue).toBeLessThan(0.01);
  });

  it('is two-sided: a large negative effect is just as extreme', () => {
    const result = rotationTest(
      (offset) => (offset === 0 ? -10 : 0.1),
      300,
      500,
      sfc32('e')
    );
    expect(result?.pValue).toBeLessThan(0.01);
  });

  it('never asks for offset 0 as a null draw', () => {
    const offsets: number[] = [];
    rotationTest(
      (offset) => {
        offsets.push(offset);
        return 1;
      },
      50,
      200,
      sfc32('f')
    );
    // First call is the observation; every later one must be a real rotation.
    expect(offsets[0]).toBe(0);
    expect(offsets.slice(1).every((o) => o >= 1 && o < 50)).toBe(true);
  });

  it('returns null when the statistic is undefined for the observed data', () => {
    expect(rotationTest(() => null, 50, 100, sfc32('g'))).toBeNull();
  });

  it('is uniform under the null, which is what makes the p-value mean anything', () => {
    // 200 independent null series; the rejection rate at 0.05 must sit near
    // 0.05. A test that only checks "small p when there is an effect" would
    // pass for a broken, always-tiny p-value.
    let rejected = 0;
    const trials = 200;
    for (let t = 0; t < trials; t++) {
      const rng = sfc32(`null-${t}`);
      const n = 120;
      const series = Array.from({ length: n }, () => rng());
      const exposure = Array.from({ length: n }, () => (rng() < 0.3 ? 1 : 0));
      const stat = (offset: number) => {
        let se = 0;
        let ne = 0;
        let su = 0;
        let nu = 0;
        for (let i = 0; i < n; i++) {
          const e = exposure[(i + offset) % n];
          if (e === 1) {
            se += series[i];
            ne++;
          } else {
            su += series[i];
            nu++;
          }
        }
        if (ne === 0 || nu === 0) return null;
        return se / ne - su / nu;
      };
      const result = rotationTest(stat, n, 300, sfc32(`rot-${t}`));
      if (result && result.pValue < 0.05) rejected++;
    }
    const rate = rejected / trials;
    expect(rate).toBeGreaterThan(0.01);
    expect(rate).toBeLessThan(0.12);
  });
});
