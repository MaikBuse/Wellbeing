import { z } from 'zod';
import { formatGermanNumber, per100FromReference, type Per100 } from '../nutrition';
import { optionalGermanNumber, optionalText, uuid } from './common';

/** The eight nutrient columns a form may write, in the order they are shown. */
export const NUTRIENT_FIELDS = [
  'kcal100',
  'protein100',
  'fat100',
  'satFat100',
  'carbs100',
  'sugar100',
  'fiber100',
  'salt100',
] as const;

export type NutrientField = (typeof NUTRIENT_FIELDS)[number];

export const NUTRIENT_LABELS: Record<NutrientField, string> = {
  kcal100: 'Kalorien',
  protein100: 'Eiweiß',
  fat100: 'Fett',
  satFat100: 'davon gesättigte Fettsäuren',
  carbs100: 'Kohlenhydrate',
  sugar100: 'davon Zucker',
  fiber100: 'Ballaststoffe',
  salt100: 'Salz',
};

/**
 * What the numbers on the label refer to.
 *
 * `portion` is anchored to the food's own portion weight, which is the only
 * piece weight this app has. That makes it an approximation for anything sold in
 * pieces — see `resolveNutrientBasis`.
 */
export const nutrientBasisKind = z.enum(['unit', 'per100', 'portion', 'custom']);
export type NutrientBasisKind = z.infer<typeof nutrientBasisKind>;

/** No label on earth states values per more than 10 kg. */
export const MAX_REFERENCE = 10_000;
/** Pure fat is 884 kcal per 100 g, ethanol 700. Nothing edible is above this. */
const MAX_KCAL_PER_100 = 900;
/** A mass fraction cannot exceed the mass. Physics, not a guess. */
const MAX_MASS_PER_100 = 100;

const nutrientEntry = optionalGermanNumber.optional();

/**
 * A weight, so strictly positive.
 *
 * Split out of the nutrient alias on purpose: a nutrient may legitimately be 0,
 * a portion weight may not. Both used to share one optional-number alias, which
 * is how `defaultPortionGrams = 0` became storable — `resolveGrams` then returns
 * 0 and the meal insert dies on `meal_item_grams_positive`, surfacing the raw
 * constraint name in a German toast.
 */
const portionWeight = nutrientEntry.refine(
  (value) => value === null || value === undefined || (Number.isFinite(value) && value > 0),
  'Das Portionsgewicht muss größer als 0 sein.'
);

const referenceAmount = nutrientEntry.refine(
  (value) =>
    value === null ||
    value === undefined ||
    (Number.isFinite(value) && value > 0 && value <= MAX_REFERENCE),
  `Die Bezugsmenge muss größer als 0 und höchstens ${MAX_REFERENCE} sein.`
);

const nutrientEntries = {
  kcal100: nutrientEntry,
  protein100: nutrientEntry,
  fat100: nutrientEntry,
  satFat100: nutrientEntry,
  carbs100: nutrientEntry,
  sugar100: nutrientEntry,
  fiber100: nutrientEntry,
  salt100: nutrientEntry,
  basisKind: nutrientBasisKind.default('per100'),
  basisAmount: referenceAmount,
};

export const createFoodSchema = z.object({
  name: z.string().trim().min(1, 'Name fehlt').max(200),
  brand: optionalText,
  barcode: z
    .string()
    .trim()
    .regex(/^\d{6,14}$/, 'Barcode besteht aus 6–14 Ziffern')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  isBeverage: z
    .union([z.boolean(), z.literal('on')])
    .transform((v) => v === true || v === 'on')
    .optional(),
  ...nutrientEntries,
  defaultPortionGrams: portionWeight,
  tagIds: z.array(uuid).max(60).optional(),
});

/**
 * The whole nutrient set in one write.
 *
 * Deliberately not per field: changing the reference amount changes all eight
 * values at once, and eight single-field calls would be neither atomic nor able
 * to check `sugar <= carbs`. `defaultPortionGrams` is NOT here — see
 * `updateFoodNutrients` for why editing it would move logged amounts.
 */
export const updateFoodNutrientsSchema = z.object({
  foodId: uuid,
  ...nutrientEntries,
});

export const updateFoodTagsSchema = z.object({
  foodId: uuid,
  tagIds: z.array(uuid).max(60),
});

export const catalogIdSchema = z.object({ catalogId: uuid });

export const barcodeSchema = z.object({
  barcode: z
    .string()
    .trim()
    .regex(/^\d{6,14}$/, 'Ungültiger Barcode'),
});

export type CreateFoodInput = z.infer<typeof createFoodSchema>;
export type UpdateFoodNutrientsInput = z.infer<typeof updateFoodNutrientsSchema>;

export type NutrientBasisEntry = {
  /** The values as they stand on the label, per `reference` of `unit`. */
  values: Per100;
  kind: NutrientBasisKind;
  basisAmount: number | null;
  /** The food's portion weight — the only anchor the `portion` basis has. */
  portionGrams: number | null;
  unit: 'g' | 'ml';
};

export type NutrientBasisResolution =
  | { ok: true; reference: number; values: Per100 }
  | {
      ok: false;
      error: string;
      /** Which input to point the inline error at. */
      field: NutrientField | 'basisAmount' | 'defaultPortionGrams';
    };

/**
 * Resolve entered values and a chosen reference amount into per-100 values, or
 * refuse with a German message naming the field at fault.
 *
 * Pure, and shared by the server actions and the client preview. The preview has
 * to call THIS — not its own `toFixed` — or it shows numbers the server will not
 * store, which defeats the only reason the preview exists.
 *
 * The result is validated, not the input. A user typing "1.000 g" for a kilo
 * sack gets a reference of 1 (the German thousands point is not a separator to
 * `Number`), and every value comes out 1000x too high while every input on its
 * own looks perfectly ordinary. Nothing but a bound on the RESULT catches that,
 * and it is the same bound that rejects NaN — which `numeric(10,2)` would
 * otherwise store, since Postgres sorts NaN above every number and a `>= 0`
 * check waves it through.
 */
export function resolveNutrientBasis(
  entry: NutrientBasisEntry
): NutrientBasisResolution {
  const unit = entry.unit;

  let reference: number;
  if (entry.kind === 'unit') reference = 1;
  else if (entry.kind === 'per100') reference = 100;
  else if (entry.kind === 'portion') {
    const grams = entry.portionGrams;
    if (grams === null || !Number.isFinite(grams) || grams <= 0) {
      return {
        ok: false,
        field: 'defaultPortionGrams',
        error: `Für „je 1 Portion“ brauche ich das Portionsgewicht in ${unit}.`,
      };
    }
    reference = grams;
  } else {
    const amount = entry.basisAmount;
    if (amount === null || !Number.isFinite(amount) || amount <= 0) {
      return {
        ok: false,
        field: 'basisAmount',
        error: `Bitte die Bezugsmenge in ${unit} angeben, größer als 0.`,
      };
    }
    if (amount > MAX_REFERENCE) {
      return {
        ok: false,
        field: 'basisAmount',
        error: `Die Bezugsmenge darf höchstens ${MAX_REFERENCE} ${unit} sein.`,
      };
    }
    reference = amount;
  }

  const values = per100FromReference(entry.values, reference);

  for (const field of NUTRIENT_FIELDS) {
    const value = values[field];
    if (value === null) continue;
    const label = NUTRIENT_LABELS[field];

    if (!Number.isFinite(value)) {
      return { ok: false, field, error: `${label} ist keine Zahl.` };
    }
    if (value < 0) {
      return { ok: false, field, error: `${label} darf nicht negativ sein.` };
    }

    const max = field === 'kcal100' ? MAX_KCAL_PER_100 : MAX_MASS_PER_100;
    if (value > max) {
      return {
        ok: false,
        field,
        error:
          `${label} ergibt ${formatGermanNumber(value, 2)} je 100 ${unit} – das kann nicht sein. ` +
          `Stimmt die Bezugsmenge? Ein Tausenderpunkt zählt nicht: „1.000“ liest die App als 1.`,
      };
    }
  }

  const impossible = firstImpossiblePair(values);
  if (impossible) return impossible;

  return { ok: true, reference, values };
}

/**
 * The two pairs that cannot be in this order.
 *
 * They catch a PARTIAL rescale, which no single-field bound can: if the fat is
 * converted and the saturated fat is not, both land inside their own limits and
 * only their relation is impossible. Worth checking precisely because nothing in
 * the app displays saturated fat, sugar or fibre today — the corruption would
 * surface the day someone adds a chart, retroactively, across a year of data.
 */
function firstImpossiblePair(
  values: Per100
): (NutrientBasisResolution & { ok: false }) | null {
  if (
    values.sugar100 !== null &&
    values.carbs100 !== null &&
    values.sugar100 > values.carbs100
  ) {
    return {
      ok: false,
      field: 'sugar100',
      error: 'Zucker kann nicht mehr sein als Kohlenhydrate insgesamt.',
    };
  }
  if (
    values.satFat100 !== null &&
    values.fat100 !== null &&
    values.satFat100 > values.fat100
  ) {
    return {
      ok: false,
      field: 'satFat100',
      error: 'Gesättigte Fettsäuren können nicht mehr sein als Fett insgesamt.',
    };
  }
  return null;
}

/** The entered values, gathered off a parsed form payload. */
export function enteredValues(input: {
  kcal100?: number | null;
  protein100?: number | null;
  fat100?: number | null;
  satFat100?: number | null;
  carbs100?: number | null;
  sugar100?: number | null;
  fiber100?: number | null;
  salt100?: number | null;
}): Per100 {
  return {
    kcal100: input.kcal100 ?? null,
    protein100: input.protein100 ?? null,
    fat100: input.fat100 ?? null,
    satFat100: input.satFat100 ?? null,
    carbs100: input.carbs100 ?? null,
    sugar100: input.sugar100 ?? null,
    fiber100: input.fiber100 ?? null,
    salt100: input.salt100 ?? null,
  };
}
