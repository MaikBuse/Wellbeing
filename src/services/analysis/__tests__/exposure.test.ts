import { describe, expect, it } from 'vitest';
import {
  COLLINEARITY_THRESHOLD,
  collinearity,
  countedConfidences,
  doseIsInterpretable,
  isExposed,
  share,
  sumMeasured,
  type MeasuredItem,
  type MeasuredPer100,
} from '@/services/analysis/exposure';

const EMPTY: MeasuredPer100 = {
  lactose: null,
  fructose: null,
  glucose: null,
  sorbitol: null,
  mannitol: null,
  alcohol: null,
  sugar: null,
  omega3: null,
  epaDha: null,
  arachidonic: null,
};

function bls(per100: Partial<MeasuredPer100>, grams: number, stated = true): MeasuredItem {
  return { grams, per100: { ...EMPTY, ...per100 }, hasStatedAmount: stated };
}

function off(grams: number, stated = true): MeasuredItem {
  return { grams, per100: null, hasStatedAmount: stated };
}

describe('sumMeasured', () => {
  it('scales the per-100 value by grams', () => {
    const totals = sumMeasured([bls({ lactose: 3.89 }, 200)]);
    expect(totals.doseByTagKey.lactose).toBeCloseTo(7.78, 10);
  });

  it('treats an unmeasured food as unmeasured, NOT as zero', () => {
    // The contract from the BLS commit. Summing nulls as 0 would understate the
    // dose, and worst on the days with many packaged products.
    const totals = sumMeasured([bls({ lactose: 4 }, 100), off(300)]);
    expect(totals.doseByTagKey.lactose).toBeCloseTo(4, 10);
    expect(totals.totalGrams).toBe(400);
    expect(totals.blsGrams).toBe(100);
  });

  it('lets a measured zero genuinely lower the dose share', () => {
    // Hard cheese measures 0 g lactose. That is information, unlike null.
    const totals = sumMeasured([bls({ lactose: 0 }, 100), bls({ lactose: 4 }, 100)]);
    expect(totals.doseByTagKey.lactose).toBeCloseTo(4, 10);
    expect(totals.blsGrams).toBe(200);
  });

  it('uses fructose in excess of glucose, not plain fructose', () => {
    // Same definition as the tag rule: this is what fructose malabsorption
    // responds to, and plain fructose would flag every fruit equally.
    const totals = sumMeasured([bls({ fructose: 6, glucose: 4 }, 100)]);
    expect(totals.doseByTagKey.fructose).toBeCloseTo(2, 10);
  });

  it('merges sorbitol and mannitol into one polyol axis', () => {
    const totals = sumMeasured([bls({ sorbitol: 0.4, mannitol: 0.4 }, 100)]);
    expect(totals.doseByTagKey.sorbitol).toBeCloseTo(0.8, 10);
  });

  it('yields no fructose dose when fructose itself was not measured', () => {
    // measuredValue returns null rather than -glucose.
    const totals = sumMeasured([bls({ glucose: 5 }, 100)]);
    expect(totals.doseByTagKey.fructose).toBeUndefined();
  });

  it('separates stated amounts from defaulted ones', () => {
    const totals = sumMeasured([bls({ lactose: 4 }, 100, true), bls({}, 100, false)]);
    expect(totals.statedGrams).toBe(100);
    expect(totals.totalGrams).toBe(200);
  });

  it('sums across several items', () => {
    const totals = sumMeasured([
      bls({ epaDha: 1.5 }, 150),
      bls({ epaDha: 0.2 }, 50),
    ]);
    expect(totals.doseByTagKey.omega3).toBeCloseTo(2.25 + 0.1, 10);
  });
});

describe('doseIsInterpretable', () => {
  it('rejects a day that is mostly unmeasured food', () => {
    const totals = sumMeasured([bls({ lactose: 4 }, 100), off(400)]);
    expect(doseIsInterpretable(totals)).toBe(false);
  });

  it('rejects a day where no amount was ever stated', () => {
    // An unedited BLS entry is exactly 100 g, so the "dose" would just be the
    // catalog's per-100 value.
    const totals = sumMeasured([bls({ lactose: 4 }, 100, false)]);
    expect(doseIsInterpretable(totals)).toBe(false);
  });

  it('accepts a day that is measured and weighed', () => {
    const totals = sumMeasured([bls({ lactose: 4 }, 300, true), off(100, true)]);
    expect(doseIsInterpretable(totals)).toBe(true);
  });
});

describe('share', () => {
  it('is 0 rather than NaN for an empty whole', () => {
    expect(share(0, 0)).toBe(0);
  });
});

describe('countedConfidences', () => {
  it('excludes trace unless the setting says otherwise', () => {
    expect(countedConfidences(false)).toEqual(['certain', 'likely']);
    expect(countedConfidences(true)).toContain('trace');
  });
});

describe('isExposed', () => {
  it('counts the threshold value itself', () => {
    expect(isExposed(5, 5)).toBe(true);
    expect(isExposed(4.999, 5)).toBe(false);
  });
});

describe('collinearity', () => {
  it('finds tags that are effectively the same days', () => {
    // Long enough to clear MIN_UNION_FOR_COLLINEARITY: below that a shared
    // single day gives a Jaccard of 1.0, which is true and vacuous.
    const gluten = [...Array(12).fill(true), ...Array(12).fill(false)];
    const yeast = [...Array(12).fill(true), ...Array(12).fill(false)];
    const fish = [...Array(12).fill(false), ...Array(12).fill(true)];

    const result = collinearity({ gluten, yeast, fish }, COLLINEARITY_THRESHOLD);
    expect(result.gluten.map((p) => p.key)).toEqual(['yeast']);
    expect(result.gluten[0].jaccard).toBe(1);
    expect(result.fish).toEqual([]);
  });

  it('never reports a tag against itself', () => {
    const result = collinearity({ a: Array(12).fill(true) }, 0);
    expect(result.a).toEqual([]);
  });

  it('ignores an overlap built from too few days', () => {
    // Two factors eaten on the same single day give a Jaccard of 1.0. Reporting
    // "tritt an 100 % der Tage gemeinsam auf" from one day would fire on nearly
    // every pair in the first weeks.
    const a = [true, false, false, false];
    const b = [true, false, false, false];
    expect(collinearity({ a, b }, COLLINEARITY_THRESHOLD).a).toEqual([]);
  });

  it('sorts the strongest overlap first', () => {
    const a = Array(12).fill(true);
    const b = [...Array(11).fill(true), false];
    const c = Array(12).fill(true);
    const result = collinearity({ a, b, c }, 0.5);
    expect(result.a[0].key).toBe('c');
  });
});
