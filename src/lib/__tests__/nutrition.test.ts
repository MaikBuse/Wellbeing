import { describe, expect, it } from 'vitest';
import {
  formatKcal,
  nutrientsForGrams,
  parseGermanNumber,
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
