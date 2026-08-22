import { describe, expect, it } from 'vitest';
import { geometricLength, randomInt, seedFromString, sfc32 } from '@/lib/random';

describe('sfc32', () => {
  it('is deterministic for a given seed', () => {
    const a = sfc32('seed-a');
    const b = sfc32('seed-a');
    const left = Array.from({ length: 50 }, () => a());
    const right = Array.from({ length: 50 }, () => b());
    expect(left).toEqual(right);
  });

  it('differs between seeds', () => {
    const a = Array.from({ length: 50 }, sfc32('seed-a'));
    const b = Array.from({ length: 50 }, sfc32('seed-b'));
    expect(a).not.toEqual(b);
  });

  it('stays inside [0, 1)', () => {
    const rng = sfc32('range');
    for (let i = 0; i < 10_000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is roughly uniform over 20 bins', () => {
    const rng = sfc32('uniformity');
    const bins = new Array(20).fill(0);
    const draws = 100_000;
    for (let i = 0; i < draws; i++) bins[Math.floor(rng() * 20)]++;

    const expected = draws / 20;
    const chiSq = bins.reduce(
      (acc, observed) => acc + (observed - expected) ** 2 / expected,
      0
    );
    // 19 df, upper 0.1 % critical value is 43.8. A generator that fails this is
    // broken, not unlucky.
    expect(chiSq).toBeLessThan(43.8);
  });

  it('hashes a string into four non-zero words', () => {
    const state = seedFromString('wellbeing');
    expect(state).toHaveLength(4);
    for (const word of state) {
      expect(Number.isInteger(word)).toBe(true);
      expect(word).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('randomInt', () => {
  it('covers the whole range and never reaches the exclusive bound', () => {
    const rng = sfc32('ints');
    const seen = new Set<number>();
    for (let i = 0; i < 5_000; i++) {
      const v = randomInt(rng, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
      seen.add(v);
    }
    expect(seen.size).toBe(7);
  });
});

describe('geometricLength', () => {
  it('is at least 1 even for a degenerate expectation', () => {
    const rng = sfc32('geom');
    expect(geometricLength(rng, 0)).toBe(1);
    expect(geometricLength(rng, 1)).toBe(1);
  });

  it('has roughly the requested mean', () => {
    const rng = sfc32('geom-mean');
    let total = 0;
    const draws = 20_000;
    for (let i = 0; i < draws; i++) total += geometricLength(rng, 10);
    expect(total / draws).toBeGreaterThan(8.5);
    expect(total / draws).toBeLessThan(11.5);
  });
});
