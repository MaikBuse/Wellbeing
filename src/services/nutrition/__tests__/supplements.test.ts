import { describe, expect, it } from 'vitest';
import {
  convertNutrientAmount,
  supplementContributions,
  type IntakeRow,
  type MedicationNutrientRow,
} from '../supplements';

const VITD_DROPS: MedicationNutrientRow = {
  medicationId: 'med-1',
  nutrientKey: 'vitD',
  amountPerPiece: 1000,
  unit: 'iu',
};

function intake(overrides: Partial<IntakeRow> = {}): IntakeRow {
  return {
    logDate: '2026-08-20',
    medicationId: 'med-1',
    status: 'taken',
    doseAmount: 2,
    doseUnit: 'piece',
    ...overrides,
  };
}

describe('convertNutrientAmount', () => {
  it('converts international units of vitamin D at 40 per microgram', () => {
    expect(convertNutrientAmount('vitD', 1000, 'iu')).toBeCloseTo(25, 10);
  });

  it('converts between mass units', () => {
    expect(convertNutrientAmount('calcium', 1, 'g')).toBe(1000); // mg
    expect(convertNutrientAmount('vitB12', 0.001, 'mg')).toBeCloseTo(1, 10); // µg
  });

  /*
   * The one refusal. RRR-alpha-tocopherol is 1.49 IU per mg, the synthetic
   * all-rac form about 1, and the label does not always say which. A fifty
   * percent error on a nutrient whose RA target is stated in IU is not a
   * rounding difference — so no number is better than a guessed one.
   */
  it('refuses to convert international units of vitamin E', () => {
    expect(convertNutrientAmount('vitE', 200, 'iu')).toBeNull();
    // ...but a milligram figure off the same label is fine.
    expect(convertNutrientAmount('vitE', 12, 'mg')).toBe(12);
  });

  it('has no conversion for energy or a ratio', () => {
    expect(convertNutrientAmount('energy', 100, 'mg')).toBeNull();
    expect(convertNutrientAmount('n6n3Ratio', 5, 'mg')).toBeNull();
  });
});

describe('supplementContributions', () => {
  it('multiplies the per-piece amount by the dose', () => {
    const [contribution] = supplementContributions([intake()], [VITD_DROPS]);
    expect(contribution.amount).toBeCloseTo(50, 10); // 2 drops * 1000 IU = 50 µg
    expect(contribution.nutrientKey).toBe('vitD');
  });

  /*
   * The trap that belongs in a test rather than a comment: a planned dose that
   * was never tapped has NO ROW. There is nothing here to skip — which is
   * exactly why this must not be reconstructed from the schedule.
   */
  it('counts a taken dose and ignores a skipped or missed one', () => {
    expect(supplementContributions([intake({ status: 'taken' })], [VITD_DROPS]))
      .toHaveLength(1);
    expect(supplementContributions([intake({ status: 'skipped' })], [VITD_DROPS]))
      .toHaveLength(0);
    expect(supplementContributions([intake({ status: 'missed' })], [VITD_DROPS]))
      .toHaveLength(0);
    expect(supplementContributions([], [VITD_DROPS])).toHaveLength(0);
  });

  it('skips a dose that was not recorded per piece', () => {
    expect(
      supplementContributions([intake({ doseUnit: 'ml' })], [VITD_DROPS])
    ).toHaveLength(0);
  });

  it('adds up two preparations carrying the same nutrient', () => {
    const second: MedicationNutrientRow = {
      medicationId: 'med-2',
      nutrientKey: 'vitD',
      amountPerPiece: 20,
      unit: 'ug',
    };
    const contributions = supplementContributions(
      [intake(), intake({ medicationId: 'med-2', doseAmount: 1 })],
      [VITD_DROPS, second]
    );
    expect(contributions).toHaveLength(1);
    expect(contributions[0].amount).toBeCloseTo(70, 10);
  });

  it('splits a combination preparation across its nutrients', () => {
    const fishOil: MedicationNutrientRow[] = [
      { medicationId: 'med-3', nutrientKey: 'epaDha', amountPerPiece: 0.5, unit: 'g' },
      { medicationId: 'med-3', nutrientKey: 'vitE', amountPerPiece: 5, unit: 'mg' },
    ];
    const contributions = supplementContributions(
      [intake({ medicationId: 'med-3', doseAmount: 2 })],
      fishOil
    );
    expect(contributions).toHaveLength(2);
    const epa = contributions.find((entry) => entry.nutrientKey === 'epaDha');
    expect(epa?.amount).toBeCloseTo(1, 10);
  });

  it('keeps contributions on their own day', () => {
    const contributions = supplementContributions(
      [intake(), intake({ logDate: '2026-08-21' })],
      [VITD_DROPS]
    );
    expect(contributions.map((entry) => entry.logDate).sort()).toEqual([
      '2026-08-20',
      '2026-08-21',
    ]);
  });
});
