import { describe, expect, it } from 'vitest';
import {
  formatGrams,
  formatKcal,
  roundKcal,
  nutrientsForGrams,
  parseGermanNumber,
  per100FromReference,
  resolveGrams,
  sumNutrients,
} from '../nutrition';

const bread = {
  kcal100: 250,
  protein100: 8.5,
  fat100: 1.2,
  satFat100: null,
  carbs100: 48,
  sugar100: 3,
  fiber100: 6,
  salt100: 1.1,
};

describe('nutrientsForGrams', () => {
  it('scales per-100 values to the logged amount', () => {
    const n = nutrientsForGrams(bread, 70);
    expect(n.kcal).toBe(175);
    expect(n.proteinG).toBe(5.95);
    expect(n.carbsG).toBe(33.6);
  });

  it('keeps missing values missing instead of turning them into 0', () => {
    expect(nutrientsForGrams(bread, 70).satFatG).toBeNull();
  });
});

describe('resolveGrams', () => {
  it('uses the chosen named portion', () => {
    expect(
      resolveGrams({ quantity: 2, unit: 'portion', portionGrams: 35 })
    ).toBe(70);
  });

  it('falls back to the food default, then to 100 g', () => {
    expect(
      resolveGrams({ quantity: 1, unit: 'portion', defaultPortionGrams: 125 })
    ).toBe(125);
    expect(resolveGrams({ quantity: 1, unit: 'portion' })).toBe(100);
  });

  it('converts ml with the food density', () => {
    expect(
      resolveGrams({ quantity: 200, unit: 'ml', densityGPerMl: 1.03 })
    ).toBe(206);
  });

  it('passes grams through', () => {
    expect(resolveGrams({ quantity: 42.5, unit: 'g' })).toBe(42.5);
  });
});

describe('sumNutrients', () => {
  it('adds values and ignores nulls', () => {
    const total = sumNutrients([
      nutrientsForGrams(bread, 70),
      nutrientsForGrams(bread, 30),
    ]);
    expect(total.kcal).toBe(250);
    expect(total.satFatG).toBeNull();
  });
});

describe('formatKcal', () => {
  it('rounds larger values to tens, since OFF data is not that precise', () => {
    expect(formatKcal(87.5)).toBe('90 kcal');
    expect(formatKcal(372)).toBe('370 kcal');
  });

  it('keeps small values honest instead of collapsing them to zero', () => {
    // Black coffee is ~4 kcal; "0 kcal" would be plainly wrong.
    expect(formatKcal(4)).toBe('4 kcal');
    expect(formatKcal(0.4)).toBe('1 kcal');
  });

  it('shows a true zero as zero and a missing value as a dash', () => {
    expect(formatKcal(0)).toBe('0 kcal');
    expect(formatKcal(null)).toBe('–');
  });
});

describe('roundKcal', () => {
  it('returns the same number formatKcal prints, so a counter can animate to it', () => {
    // The animated hero figure counts up to this value while the label next to
    // it comes from formatKcal — they must not disagree.
    expect(roundKcal(87.5)).toBe(90);
    expect(roundKcal(372)).toBe(370);
    expect(roundKcal(4)).toBe(4);
    expect(roundKcal(0.4)).toBe(1);
    expect(roundKcal(0)).toBe(0);
  });
});

describe('parseGermanNumber', () => {
  it('accepts a German decimal comma', () => {
    // Number('12,5') is NaN — this is a real source of silent data loss.
    expect(parseGermanNumber('12,5')).toBe(12.5);
  });

  it('accepts a point as well', () => {
    expect(parseGermanNumber('12.5')).toBe(12.5);
  });

  it('returns null for empty or malformed input', () => {
    expect(parseGermanNumber('')).toBeNull();
    expect(parseGermanNumber('  ')).toBeNull();
    expect(parseGermanNumber('viel')).toBeNull();
  });
});

describe('per100FromReference', () => {
  it('leaves a per-100 label alone', () => {
    // The identity case. If this ever drifts, every food entered before the
    // change disagrees with every food entered after it.
    expect(per100FromReference(bread, 100)).toEqual(bread);
  });

  it('multiplies a per-1 label by 100', () => {
    const spice = { ...bread, kcal100: 3.5, salt100: 0.012 };
    const per100 = per100FromReference(spice, 1);
    expect(per100.kcal100).toBe(350);
    // The precision goes UP, not down: a third decimal of the entry survives
    // as the first decimal of the stored value.
    expect(per100.salt100).toBe(1.2);
  });

  it('scales a piece or a package', () => {
    // An egg: 78 kcal on a 60 g piece.
    expect(per100FromReference({ ...bread, kcal100: 78 }, 60).kcal100).toBe(130);
    // A 330 ml can.
    expect(per100FromReference({ ...bread, kcal100: 112 }, 250).kcal100).toBe(44.8);
  });

  it('keeps missing values missing instead of turning them into 0', () => {
    // The same guarantee nutrientsForGrams and sumNutrients carry. A null salt
    // figure means "not on the label", and 0 g of salt is a claim.
    expect(per100FromReference(bread, 1).satFat100).toBeNull();
  });

  it('keeps a real zero as zero', () => {
    expect(per100FromReference({ ...bread, salt100: 0 }, 250).salt100).toBe(0);
  });

  it('round-trips exactly whenever 100 / reference is a whole number', () => {
    // 1, 2, 4, 5, 10, 20, 25, 50, 100 — the conversion is then a two-decimal
    // number times an integer, so nothing is lost in either direction.
    for (const reference of [1, 2, 4, 5, 10, 20, 25, 50, 100]) {
      const per100 = per100FromReference(bread, reference);
      const back = nutrientsForGrams(per100, reference);
      expect(back.kcal).toBe(bread.kcal100);
      expect(back.proteinG).toBe(bread.protein100);
      expect(back.saltG).toBe(bread.salt100);
    }
  });

  it('round-trips a package size within the storage granularity, not exactly', () => {
    // The honest form of the property. Storage is numeric(10,2), so a reference
    // above 100 loses at most half a stored step scaled back up:
    // 0.005 * reference / 100 + 0.005. Asserting equality here would be a test
    // that documents a guarantee the column cannot give.
    for (const reference of [330, 350, 400, 500, 1000]) {
      const bound = 0.005 * (reference / 100) + 0.005;
      const back = nutrientsForGrams(per100FromReference(bread, reference), reference);
      expect(Math.abs((back.proteinG ?? 0) - bread.protein100)).toBeLessThanOrEqual(bound);
      expect(Math.abs((back.saltG ?? 0) - bread.salt100)).toBeLessThanOrEqual(bound);
    }
  });

  it('refuses a reference that would divide by zero', () => {
    // Not pedantry. numeric(10,2) REJECTS Infinity but silently ACCEPTS NaN,
    // and Postgres sorts NaN above every number, so a >= 0 constraint would
    // wave it through and the detail page would print "NaN kcal".
    expect(() => per100FromReference(bread, 0)).toThrow();
    expect(() => per100FromReference(bread, -100)).toThrow();
    expect(() => per100FromReference(bread, Number.NaN)).toThrow();
    expect(() => per100FromReference(bread, Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('formatGrams', () => {
  it('keeps the decimals a nutrient label actually has', () => {
    // Whole grams turned 0,4 g of salt into "0 g", and 0,4 against 1,1 per 100 g
    // is a difference people watch for.
    expect(formatGrams(0.4)).toBe('0,4 g');
    expect(formatGrams(8.5)).toBe('8,5 g');
  });

  it('does not add decimals a value does not have', () => {
    expect(formatGrams(48)).toBe('48 g');
  });

  it('shows a missing value as a dash', () => {
    expect(formatGrams(null)).toBe('–');
  });
});
