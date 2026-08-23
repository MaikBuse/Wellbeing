import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DenseFoodRow } from '@/db/queries/nutrition';
import type { MascotFocus } from '../mascot';
import { MIN_STEP_SHARE, rankNextStep } from '../next-step';
import { minTarget } from './fixtures';

function focus(over: Partial<MascotFocus> = {}): MascotFocus {
  return {
    key: 'fiber',
    labelDe: 'Ballaststoffe',
    kind: 'gap',
    cadence: 'daily',
    remaining: 10,
    target: minTarget(30),
    measured: 20,
    isLowerBound: false,
    ...over,
  };
}

function food(over: Partial<DenseFoodRow> = {}): DenseFoodRow {
  return {
    foodId: 'a',
    name: 'Haferflocken',
    brand: null,
    per100: 10,
    defaultPortionGrams: 60,
    uses: 4,
    ...over,
  };
}

describe('rankNextStep', () => {
  it('says nothing about a breached limit', () => {
    expect(rankNextStep(focus({ kind: 'limit' }), [food()])).toBeNull();
  });

  it('says nothing without a measured shortfall', () => {
    expect(rankNextStep(focus({ remaining: null }), [food()])).toBeNull();
  });

  it('says nothing without a target, as on the weekly view', () => {
    expect(rankNextStep(focus({ target: null }), [food()])).toBeNull();
  });

  it('says nothing when there is nothing on the shelf', () => {
    expect(rankNextStep(focus(), [])).toBeNull();
  });

  it('computes the portion contribution from the stated portion weight', () => {
    const step = rankNextStep(focus(), [food()]);
    expect(step).not.toBeNull();
    expect(step?.portionGrams).toBe(60);
    expect(step?.perPortion).toBeCloseTo(6, 10);
    expect(step?.shareOfGap).toBeCloseTo(0.6, 10);
  });

  it('assumes 100 g when the food states no portion', () => {
    const step = rankNextStep(focus(), [food({ defaultPortionGrams: null })]);
    expect(step?.portionGrams).toBe(100);
    expect(step?.perPortion).toBeCloseTo(10, 10);
  });

  it('caps the share at one instead of promising 300 %', () => {
    const step = rankNextStep(focus({ remaining: 2 }), [food()]);
    expect(step?.shareOfGap).toBe(1);
  });

  /* A portion that closes four percent of the gap is busywork. */
  it('refuses a suggestion that barely moves the gap', () => {
    const tiny = food({ per100: 0.5, defaultPortionGrams: 20 });
    const step = rankNextStep(focus(), [tiny]);
    expect((0.5 * 20) / 100 / 10).toBeLessThan(MIN_STEP_SHARE);
    expect(step).toBeNull();
  });

  it('skips the ones that barely move it and takes one that does', () => {
    const step = rankNextStep(focus(), [
      food({ foodId: 'tiny', name: 'Petersilie', per100: 0.5, defaultPortionGrams: 5 }),
      food({ foodId: 'real', name: 'Linsen', per100: 8, defaultPortionGrams: 80 }),
    ]);
    expect(step?.foodId).toBe('real');
  });

  /*
   * The spice is ninety times denser per 100 g and still loses, because half a
   * gram of it is half a gram. Ranking on the per-100 value would put a herb
   * nobody eats a portion of at the top of every list.
   */
  it('ranks by what a portion contributes, not by the per-100 value', () => {
    const step = rankNextStep(focus(), [
      food({ foodId: 'spice', name: 'Gewürz', per100: 900, defaultPortionGrams: 0.5 }),
      food({ foodId: 'oats', name: 'Haferflocken', per100: 10, defaultPortionGrams: 60 }),
    ]);
    expect(step?.foodId).toBe('oats');
    expect(step?.perPortion).toBeCloseTo(6, 10);
  });

  it('is independent of the order it gets the rows in', () => {
    const rows = [
      food({ foodId: 'a', name: 'Aprikose', per100: 3, defaultPortionGrams: 50 }),
      food({ foodId: 'b', name: 'Bohnen', per100: 7, defaultPortionGrams: 100 }),
      food({ foodId: 'c', name: 'Cashew', per100: 5, defaultPortionGrams: 30 }),
    ];
    const forward = rankNextStep(focus(), rows);
    const backward = rankNextStep(focus(), [...rows].reverse());
    expect(forward).toEqual(backward);
    expect(forward?.foodId).toBe('b');
  });

  it('breaks a tie by her own use count, then by name', () => {
    const step = rankNextStep(focus(), [
      food({ foodId: 'rare', name: 'Aaa', per100: 10, defaultPortionGrams: 60, uses: 1 }),
      food({ foodId: 'often', name: 'Zzz', per100: 10, defaultPortionGrams: 60, uses: 9 }),
    ]);
    expect(step?.foodId).toBe('often');
  });

  it('ignores rows with no usable value', () => {
    const step = rankNextStep(focus(), [
      food({ foodId: 'zero', per100: 0 }),
      food({ foodId: 'negative', defaultPortionGrams: -5 }),
    ]);
    expect(step).toBeNull();
  });
});

describe('reinheit', () => {
  it('reads no clock and rolls no dice', () => {
    const source = readFileSync('src/services/nutrition/next-step.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ');
    expect(source).not.toMatch(/new Date|Date\.now|Math\.random/);
    expect(source).not.toMatch(/todayLogDate/);
  });

  /*
   * The structural half of "no supplement nudge": there is no import that
   * could reach a preparation, so no future edit can accidentally suggest one
   * without also adding a dependency a reviewer would see.
   */
  it('cannot reach a supplement', () => {
    // Comments stripped, so the paragraph explaining the rule does not trip it.
    const source = readFileSync('src/services/nutrition/next-step.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ');
    expect(source).not.toMatch(/medication|supplement/i);
  });
});
