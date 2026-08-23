import { describe, expect, it } from 'vitest';
import { roundForDisplay, share, sumDayNutrients } from '../aggregate';
import { item } from './fixtures';

const DAY = '2026-08-20';

describe('sumDayNutrients', () => {
  it('scales a catalog value by the logged grams', () => {
    const day = sumDayNutrients(DAY, [
      item({ grams: 250, per100: { calcium: 120 } }),
    ]);
    expect(day.totals.calcium.fromFood).toBeCloseTo(300, 10);
    expect(day.totals.calcium.coverage).toBe(1);
  });

  it('takes a snapshot value as the amount already resolved', () => {
    const day = sumDayNutrients(DAY, [
      item({ grams: 250, snapshot: { protein: 18 } }),
      item({ grams: 100, snapshot: { protein: 7 } }),
    ]);
    expect(day.totals.protein.fromFood).toBe(25);
  });

  /*
   * The BLS contract, on a day total: null is "not measured" and contributes
   * nothing. Summing it as zero would understate every total, and worst on the
   * days with the most packaged food — the opposite of a harmless bias.
   */
  it('never adds a null as a zero, and lets it lower the coverage instead', () => {
    const day = sumDayNutrients(DAY, [
      item({ grams: 200, per100: { calcium: 100 } }),
      item({ grams: 300, per100: { calcium: null } }),
    ]);
    expect(day.totals.calcium.fromFood).toBeCloseTo(200, 10);
    expect(day.totals.calcium.coverage).toBeCloseTo(0.4, 10);
  });

  it('distinguishes an unmeasured value from a measured zero', () => {
    const unmeasured = sumDayNutrients(DAY, [
      item({ grams: 100, per100: { calcium: null } }),
    ]);
    const measuredZero = sumDayNutrients(DAY, [
      item({ grams: 100, per100: { calcium: 0 } }),
    ]);
    expect(unmeasured.totals.calcium.fromFood).toBeNull();
    expect(unmeasured.totals.calcium.coverage).toBe(0);
    expect(measuredZero.totals.calcium.fromFood).toBe(0);
    expect(measuredZero.totals.calcium.coverage).toBe(1);
  });

  it('treats a food without a catalog link as unmeasured for every micronutrient', () => {
    const day = sumDayNutrients(DAY, [
      item({ grams: 400, per100: null, snapshot: { protein: 30 } }),
    ]);
    expect(day.totals.calcium.fromFood).toBeNull();
    expect(day.totals.calcium.coverage).toBe(0);
    // ...while the frozen macro is unaffected: it never needed the catalog.
    expect(day.totals.protein.fromFood).toBe(30);
    expect(day.totals.protein.coverage).toBe(1);
    expect(day.blsGramsShare).toBe(0);
  });

  it('computes coverage per nutrient, not once for the day', () => {
    const day = sumDayNutrients(DAY, [
      item({ grams: 700, per100: { calcium: 100, iodine: null } }),
      item({ grams: 300, per100: { calcium: 50, iodine: 3 } }),
    ]);
    expect(day.totals.calcium.coverage).toBe(1);
    expect(day.totals.iodine.coverage).toBeCloseTo(0.3, 10);
  });

  it('weights coverage by grams, not by item count', () => {
    const day = sumDayNutrients(DAY, [
      item({ grams: 5, per100: { iodine: null } }),
      item({ grams: 495, per100: { iodine: 2 } }),
    ]);
    expect(day.totals.iodine.coverage).toBeCloseTo(0.99, 10);
  });

  /*
   * The rounding trap, as a number.
   *
   * round2 from lib/nutrition.ts must not be used here: 0.045 µg per 100 g over
   * a 15 g portion is 0.00675 µg, which rounds to 0.01 and overstates that item
   * by nearly half. Over ten items it compounds into a day total that is simply
   * wrong — 0.10 instead of 0.0675, half as much again.
   */
  it('carries micronutrient sums at full precision', () => {
    const items = Array.from({ length: 10 }, () =>
      item({ grams: 15, per100: { vitD: 0.045 } })
    );
    const day = sumDayNutrients(DAY, items);
    expect(day.totals.vitD.fromFood).toBeCloseTo(0.0675, 12);
    expect(day.totals.vitD.fromFood).not.toBeCloseTo(0.1, 3);
  });

  it('rounds only at the edge, in the nutrient own precision', () => {
    expect(roundForDisplay(0.0675, 'vitD')).toBe(0.1);
    expect(roundForDisplay(1234.6, 'calcium')).toBe(1235);
  });

  /* Arachidonic acid is the one unit conversion: the BLS stores grams, the RA
   * limit is 50 mg, and "0,05 g" reads as noise next to a limit. */
  it('converts arachidonic acid from catalog grams to milligrams', () => {
    const day = sumDayNutrients(DAY, [
      item({ grams: 100, per100: { arachidonic: 0.08 } }),
    ]);
    expect(day.totals.arachidonic.fromFood).toBeCloseTo(80, 10);
  });

  it('counts stated portions and main slots for the day gates', () => {
    const day = sumDayNutrients(DAY, [
      item({ grams: 300, slot: 'breakfast', hasStatedAmount: true }),
      item({ grams: 100, slot: 'snack', hasStatedAmount: false }),
      item({ grams: 300, slot: 'dinner', hasStatedAmount: true }),
    ]);
    expect(day.mainSlots).toBe(2);
    expect(day.portionEvidenceShare).toBeCloseTo(600 / 700, 10);
  });

  it('survives a day with no grams at all without dividing by zero', () => {
    const day = sumDayNutrients(DAY, []);
    expect(day.totalGrams).toBe(0);
    expect(day.portionEvidenceShare).toBe(0);
    expect(day.totals.calcium.coverage).toBe(0);
    expect(day.totals.calcium.total).toBeNull();
    expect(share(0, 0)).toBe(0);
  });
});

describe('Verhältnis Omega-6 zu Omega-3', () => {
  it('is the quotient of the two totals', () => {
    const day = sumDayNutrients(DAY, [
      item({ grams: 100, per100: { omega6: 10, omega3: 2 } }),
    ]);
    expect(day.totals.n6n3Ratio.total).toBeCloseTo(5, 10);
  });

  /* A ratio is only as good as its weaker half. */
  it('inherits the lower coverage of its two parts', () => {
    const day = sumDayNutrients(DAY, [
      item({ grams: 800, per100: { omega6: 10, omega3: null } }),
      item({ grams: 200, per100: { omega6: 10, omega3: 2 } }),
    ]);
    expect(day.totals.omega6.coverage).toBe(1);
    expect(day.totals.omega3.coverage).toBeCloseTo(0.2, 10);
    expect(day.totals.n6n3Ratio.coverage).toBeCloseTo(0.2, 10);
  });

  it('is null rather than infinite when no omega-3 was measured', () => {
    const day = sumDayNutrients(DAY, [
      item({ grams: 100, per100: { omega6: 10, omega3: null } }),
    ]);
    expect(day.totals.n6n3Ratio.total).toBeNull();
  });

  it('is null rather than dividing by a measured zero', () => {
    const day = sumDayNutrients(DAY, [
      item({ grams: 100, per100: { omega6: 10, omega3: 0 } }),
    ]);
    expect(day.totals.n6n3Ratio.total).toBeNull();
  });
});

describe('Supplemente', () => {
  it('are kept separate from the food total', () => {
    const day = sumDayNutrients(
      DAY,
      [item({ grams: 200, per100: { vitD: 1 } })],
      [{ logDate: DAY, nutrientKey: 'vitD', amount: 25 }]
    );
    expect(day.totals.vitD.fromFood).toBeCloseTo(2, 10);
    expect(day.totals.vitD.fromSupplement).toBe(25);
    expect(day.totals.vitD.total).toBeCloseTo(27, 10);
  });

  /*
   * A capsule was swallowed whether or not the meals around it were recorded
   * well enough to measure anything, so it stands on its own.
   */
  it('count even when nothing was measurable from food', () => {
    const day = sumDayNutrients(
      DAY,
      [item({ grams: 200, per100: null })],
      [{ logDate: DAY, nutrientKey: 'vitD', amount: 50 }]
    );
    expect(day.totals.vitD.fromFood).toBeNull();
    expect(day.totals.vitD.total).toBe(50);
    // The coverage still describes the FOOD, so it stays honest at zero.
    expect(day.totals.vitD.coverage).toBe(0);
  });

  it('ignore a contribution from another day', () => {
    const day = sumDayNutrients(DAY, [], [
      { logDate: '2026-08-19', nutrientKey: 'vitD', amount: 50 },
    ]);
    expect(day.totals.vitD.total).toBeNull();
  });
});
