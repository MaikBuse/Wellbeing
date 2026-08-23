import { describe, expect, it } from 'vitest';
import {
  createFoodPortionSchema,
  createFoodSchema,
  enteredValues,
  resolveNutrientBasis,
  resolvePortionGrams,
  type NutrientBasisEntry,
  type PortionGramsEntry,
} from '../food';

const label = {
  kcal100: 250,
  protein100: 8.5,
  fat100: 1.2,
  satFat100: 0.3,
  carbs100: 48,
  sugar100: 3,
  fiber100: 6,
  salt100: 1.1,
};

/** A spice, as its label states it: per 1 g. */
const perGram = {
  kcal100: 3.5,
  protein100: 0.1,
  fat100: 0.05,
  satFat100: 0.01,
  carbs100: 0.5,
  sugar100: 0.02,
  fiber100: 0.3,
  salt100: 0.012,
};

/** Flour, labelled per 1000 g — the entry a thousands point turns into 1 g. */
const kiloSack = {
  kcal100: 3480,
  protein100: 100,
  fat100: 10,
  satFat100: 2,
  carbs100: 720,
  sugar100: 10,
  fiber100: 40,
  salt100: 0,
};

/** An egg, as its label states it: per 60 g piece. */
const perPiece = {
  kcal100: 78,
  protein100: 7.5,
  fat100: 5.4,
  satFat100: 1.6,
  carbs100: 0.4,
  sugar100: 0.2,
  fiber100: 0,
  salt100: 0.2,
};

function resolve(over: Partial<NutrientBasisEntry> = {}) {
  return resolveNutrientBasis({
    values: label,
    kind: 'per100',
    basisAmount: null,
    portionGrams: null,
    unit: 'g',
    ...over,
  });
}

describe('resolveNutrientBasis — the reference amount', () => {
  it('passes a per-100 label straight through', () => {
    const result = resolve();
    expect(result.ok && result.reference).toBe(100);
    expect(result.ok && result.values).toEqual(label);
  });

  it('scales a per-1 label', () => {
    const result = resolve({ kind: 'unit', values: perGram });
    expect(result.ok && result.values.kcal100).toBe(350);
    // The precision goes up: a third decimal of the entry becomes the first
    // decimal of the stored value.
    expect(result.ok && result.values.salt100).toBe(1.2);
  });

  it('uses the portion weight for the portion basis', () => {
    const result = resolve({ kind: 'portion', portionGrams: 60, values: perPiece });
    expect(result.ok && result.reference).toBe(60);
    expect(result.ok && result.values.kcal100).toBe(130);
    expect(result.ok && result.values.protein100).toBe(12.5);
  });

  it('names the portion weight when the portion basis has nothing to divide by', () => {
    // The dependency must not be silent: without a piece weight there is no way
    // to reach grams, and a generic "Eingabe ungültig" sends her looking at the
    // nutrient fields instead of the one field that is missing.
    const result = resolve({ kind: 'portion', portionGrams: null });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.field).toBe('defaultPortionGrams');
    expect(!result.ok && result.error).toContain('Portionsgewicht');
  });

  it('refuses a free amount of zero rather than dividing by it', () => {
    const result = resolve({ kind: 'custom', basisAmount: 0 });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.field).toBe('basisAmount');
  });

  it('refuses a free amount no label could state', () => {
    const result = resolve({ kind: 'custom', basisAmount: 50_000 });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.field).toBe('basisAmount');
  });

  it('names ml for a drink', () => {
    const result = resolve({ kind: 'custom', basisAmount: null, unit: 'ml' });
    expect(!result.ok && result.error).toContain('ml');
  });
});

describe('resolveNutrientBasis — the result bounds', () => {
  it('catches a German thousands point, which no input check can', () => {
    // "1.000" for a kilo sack parses as 1, so every value comes out 1000x too
    // high while each entry on its own looks perfectly ordinary. An
    // Atwater energy cross-check would not see it either: a uniform factor
    // preserves 4P + 9F + 4C = kcal exactly. Only a bound on the RESULT does.
    const result = resolve({ values: kiloSack, kind: 'custom', basisAmount: 1 });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain('Bezugsmenge');
  });

  it('refuses more mass than the food weighs', () => {
    const result = resolve({ values: { ...label, carbs100: 140 } });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.field).toBe('carbs100');
  });

  it('refuses more energy than pure fat has', () => {
    const result = resolve({ values: { ...label, kcal100: 1200 } });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.field).toBe('kcal100');
  });

  it('refuses a negative nutrient', () => {
    // It would flow into meal_item unchallenged — grams stay positive, so the
    // meal_item_grams_positive constraint never fires — and then the day screen
    // prints "1 kcal" for a negative total while the macro legend shows -12 g.
    const result = resolve({ values: { ...label, fat100: -3 } });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.field).toBe('fat100');
  });

  it('catches a partial rescale through the pairs that cannot invert', () => {
    // Sugar converted, carbohydrates not. Both are inside their own bounds; only
    // their relation is impossible. Worth checking precisely because nothing in
    // the app displays sugar today, so the corruption would surface a year later.
    const sugar = resolve({ values: { ...label, sugar100: 30, carbs100: 12 } });
    expect(!sugar.ok && sugar.field).toBe('sugar100');
    const satFat = resolve({ values: { ...label, satFat100: 9, fat100: 1.2 } });
    expect(!satFat.ok && satFat.field).toBe('satFat100');
  });

  it('lets a legitimately extreme food through', () => {
    // Pure oil: 884 kcal and 100 g of fat per 100 g. The bounds have to sit
    // above reality, not at the average.
    const oil = resolve({
      values: {
        kcal100: 884,
        protein100: 0,
        fat100: 100,
        satFat100: 14,
        carbs100: 0,
        sugar100: 0,
        fiber100: 0,
        salt100: 0,
      },
    });
    expect(oil.ok).toBe(true);
  });
});

describe('createFoodSchema', () => {
  it('carries saturated fat, which the manual path used to drop', () => {
    const parsed = createFoodSchema.safeParse({
      name: 'Testbrot',
      satFat100: '0,3',
    });
    expect(parsed.success && parsed.data.satFat100).toBe(0.3);
  });

  it('defaults to the per-100 basis, so an old payload keeps its meaning', () => {
    const parsed = createFoodSchema.safeParse({ name: 'Testbrot' });
    expect(parsed.success && parsed.data.basisKind).toBe('per100');
  });

  it('refuses a portion weight of zero', () => {
    // resolveGrams would return 0 grams for every logged portion and the meal
    // insert would die on a check constraint, surfacing its raw name in a toast.
    const parsed = createFoodSchema.safeParse({
      name: 'Testbrot',
      defaultPortionGrams: '0',
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts the exact payload the form sends', () => {
    // The seam between the controlled form and the action. Every numeric field
    // arrives as the German string the input holds, empty strings included, and
    // the form always sends a basis — so this is the shape that has to parse.
    const parsed = createFoodSchema.safeParse({
      name: 'Testgewürz',
      brand: '',
      barcode: '',
      isBeverage: false,
      defaultPortionGrams: '',
      tagIds: [],
      kcal100: '3,5',
      protein100: '',
      fat100: '',
      satFat100: '',
      carbs100: '0,5',
      sugar100: '',
      fiber100: '',
      salt100: '0,012',
      basisKind: 'unit',
      basisAmount: '',
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.brand).toBeNull();
    expect(parsed.data.barcode).toBeUndefined();
    const resolved = resolveNutrientBasis({
      values: enteredValues(parsed.data),
      kind: parsed.data.basisKind,
      basisAmount: parsed.data.basisAmount ?? null,
      portionGrams: parsed.data.defaultPortionGrams ?? null,
      unit: parsed.data.isBeverage ? 'ml' : 'g',
    });
    expect(resolved.ok && resolved.values.kcal100).toBe(350);
    expect(resolved.ok && resolved.values.salt100).toBe(1.2);
    // Untouched fields stay null, so a later OFF refresh may still fill them.
    expect(resolved.ok && resolved.values.protein100).toBeNull();
  });

  it('reads a German decimal comma', () => {
    const parsed = createFoodSchema.safeParse({ name: 'X', kcal100: '12,5' });
    expect(parsed.success && parsed.data.kcal100).toBe(12.5);
  });
});

describe('enteredValues', () => {
  it('turns absent fields into null, never into 0', () => {
    expect(enteredValues({ kcal100: 250 })).toEqual({
      kcal100: 250,
      protein100: null,
      fat100: null,
      satFat100: null,
      carbs100: null,
      sugar100: null,
      fiber100: null,
      salt100: null,
    });
  });
});

const portion = (over: Partial<PortionGramsEntry>): PortionGramsEntry => ({
  mode: 'direct',
  amount: null,
  count: null,
  totalAmount: null,
  kcalPerUnit: null,
  kcal100: null,
  unit: 'g',
  ...over,
});

describe('resolvePortionGrams', () => {
  it('takes a directly entered weight', () => {
    const r = resolvePortionGrams(portion({ mode: 'direct', amount: 58 }));
    expect(r).toEqual({ ok: true, grams: 58 });
  });

  it('divides a weighed batch — ten eggs at 580 g are 58 g each', () => {
    const r = resolvePortionGrams(
      portion({ mode: 'weighed', count: 10, totalAmount: 580 })
    );
    expect(r).toEqual({ ok: true, grams: 58 });
  });

  it('rounds the batch division to the two decimals the column stores', () => {
    const r = resolvePortionGrams(
      portion({ mode: 'weighed', count: 3, totalAmount: 100 })
    );
    expect(r.ok && r.grams).toBe(33.33);
  });

  it('refuses a fractional count — half an egg cannot be counted', () => {
    const r = resolvePortionGrams(
      portion({ mode: 'weighed', count: 2.5, totalAmount: 100 })
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.field).toBe('count');
  });

  it('refuses a count of zero rather than dividing by it', () => {
    const r = resolvePortionGrams(
      portion({ mode: 'weighed', count: 0, totalAmount: 100 })
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.field).toBe('count');
  });

  it('refuses a missing or non-positive total', () => {
    for (const totalAmount of [null, 0, -5]) {
      const r = resolvePortionGrams(
        portion({ mode: 'weighed', count: 4, totalAmount })
      );
      expect(r.ok).toBe(false);
      expect(!r.ok && r.field).toBe('totalAmount');
    }
  });

  it('derives the weight from calories per unit', () => {
    const r = resolvePortionGrams(
      portion({ mode: 'kcal', kcalPerUnit: 90, kcal100: 155 })
    );
    expect(r.ok && r.grams).toBe(58.06);
  });

  it('refuses the kcal mode when the food has no energy value', () => {
    for (const kcal100 of [null, 0]) {
      const r = resolvePortionGrams(
        portion({ mode: 'kcal', kcalPerUnit: 90, kcal100 })
      );
      expect(r.ok).toBe(false);
      expect(!r.ok && r.field).toBe('kcalPerUnit');
      expect(!r.ok && r.error).toContain('Kalorienwert');
    }
  });

  it('names the basis unit in its messages, so a drink does not read as grams', () => {
    const r = resolvePortionGrams(
      portion({ mode: 'direct', amount: null, unit: 'ml' })
    );
    expect(!r.ok && r.error).toContain('ml');
  });

  /**
   * The thousands-point trap, the same one `resolveNutrientBasis` guards. Every
   * input looks ordinary on its own: "1.000" is 1 to Number, so a total of one
   * kilo becomes one gram and each of ten units weighs 0,1 g. Only a bound on
   * the RESULT could catch the other direction, and this checks both ends.
   */
  it('rejects a result above the reference ceiling', () => {
    const r = resolvePortionGrams(
      portion({ mode: 'direct', amount: 10_001 })
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain('Tausenderpunkt');
  });

  it('never lets NaN or Infinity through as a weight', () => {
    for (const amount of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolvePortionGrams(portion({ mode: 'direct', amount })).ok).toBe(
        false
      );
    }
    // A division that would produce Infinity is caught before it happens.
    expect(
      resolvePortionGrams(
        portion({ mode: 'kcal', kcalPerUnit: 90, kcal100: Number.NaN })
      ).ok
    ).toBe(false);
  });
});

describe('createFoodPortionSchema', () => {
  const foodId = '00000000-0000-4000-8000-000000000001';

  it('reads German decimal commas in every mode', () => {
    const parsed = createFoodPortionSchema.safeParse({
      foodId,
      labelDe: ' Stück ',
      mode: 'weighed',
      count: '10',
      totalAmount: '580,5',
    });
    expect(parsed.success && parsed.data.labelDe).toBe('Stück');
    expect(parsed.success && parsed.data.totalAmount).toBe(580.5);
  });

  it('refuses an empty name', () => {
    const parsed = createFoodPortionSchema.safeParse({
      foodId,
      labelDe: '   ',
      mode: 'direct',
      amount: '58',
    });
    expect(parsed.success).toBe(false);
  });
});
