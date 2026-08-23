import { z } from 'zod';
import { NUTRIENT_KEYS } from '@/lib/nutrients';
import { germanNumber, optionalText } from './common';

/**
 * The nutrient-goal questionnaire and the target overrides.
 *
 * Every field is independently nullable and independently validated, because
 * the form saves field by field like the daily check does. The cross-field
 * rules — menopause only with a female reference, a protein cap only with a
 * renal diagnosis — are CHECK constraints on the table and are re-derived when
 * the targets are computed, so a half-filled profile is a legal state rather
 * than an error to fight.
 */

export const referenceSex = z.enum(['female', 'male']);
export const activityLevel = z.enum([
  'sedentary',
  'light',
  'moderate',
  'active',
  'very_active',
]);
export const weightGoal = z.enum(['maintain', 'lose', 'gain']);
export const menopauseStage = z.enum(['pre', 'peri', 'post']);
export const dietForm = z.enum([
  'omnivore',
  'pescetarian',
  'vegetarian',
  'vegan',
]);
export const weightSource = z.enum(['daily_log', 'manual']);

const CURRENT_YEAR_MAX = 2100;

/**
 * A number field of the questionnaire, as the form actually sends it: a raw
 * string, empty for "no answer".
 *
 * Every message names the range AND an example. The generic zod default said
 * "Invalid input" in English and left the reader to guess whether 115 was too
 * large, the wrong unit, or the wrong separator.
 *
 * The bounds are the table CHECKs (`unp_*_sane`) restated. They are duplicated
 * on purpose: the constraint is what makes a bad row impossible, this is what
 * makes a bad row explainable.
 */
const rangedNumber = (
  min: number,
  max: number,
  message: string,
  { int = false }: { int?: boolean } = {}
) =>
  z
    .string(message)
    .nullable()
    .transform((raw, ctx) => {
      if (raw === null || raw.trim() === '') return null;

      // `germanNumber` owns the comma and whitespace rule; only the verdict is
      // ours. A union of ('' | number) would work too, but then `issues[0]` is
      // zod's own union error — "Invalid input", in English, about a field it
      // does not name. That is the message this whole helper exists to avoid.
      const number = germanNumber.safeParse(raw);
      const value = number.success ? number.data : null;

      if (
        value === null ||
        value < min ||
        value > max ||
        (int && !Number.isInteger(value))
      ) {
        ctx.addIssue({ code: 'custom', message });
        return z.NEVER;
      }
      return value;
    });

export const PROFILE_HINT_DE = {
  birthYear: 'Vierstellig, zwischen 1900 und heute — zum Beispiel 1985.',
  heightCm: 'In Zentimetern, zwischen 100 und 250 — zum Beispiel 178.',
  referenceWeightKg:
    'In Kilogramm, zwischen 30 und 250 — zum Beispiel 72,5.',
  proteinMaxGPerKg:
    'Gramm je Kilogramm Körpergewicht, zwischen 0,40 und 2,50 — zum Beispiel 0,80.',
} as const;

/**
 * One field of the questionnaire.
 *
 * A discriminated union rather than a partial object: it makes "save this one
 * answer" the only shape the action accepts, so a stray extra key cannot ride
 * along on an autosave.
 *
 * Every numeric field takes a STRING, not a number — German keypads produce
 * "72,5" and `Number('72,5')` is NaN, so the comma has to survive as far as
 * `germanNumber`. A form that sends `Number(input.value)` here does not fail
 * its range check, it fails the type check, and the reader is told "Invalid
 * input" about a perfectly ordinary weight.
 */
export const nutritionProfileFieldSchema = z.discriminatedUnion('field', [
  z.object({ field: z.literal('referenceSex'), value: referenceSex.nullable() }),
  z.object({
    field: z.literal('birthYear'),
    value: rangedNumber(
      1900,
      CURRENT_YEAR_MAX,
      `Bitte ein Geburtsjahr eingeben. ${PROFILE_HINT_DE.birthYear}`,
      { int: true }
    ),
  }),
  z.object({
    field: z.literal('heightCm'),
    value: rangedNumber(
      100,
      250,
      `Bitte die Körpergröße eingeben. ${PROFILE_HINT_DE.heightCm}`,
      { int: true }
    ),
  }),
  z.object({ field: z.literal('activityLevel'), value: activityLevel }),
  z.object({ field: z.literal('goal'), value: weightGoal }),
  z.object({ field: z.literal('hasSarcopenia'), value: z.boolean() }),
  z.object({
    field: z.literal('menopauseStage'),
    value: menopauseStage.nullable(),
  }),
  z.object({ field: z.literal('dietForm'), value: dietForm }),
  z.object({ field: z.literal('renalImpairment'), value: z.boolean() }),
  z.object({
    field: z.literal('proteinMaxGPerKg'),
    value: rangedNumber(
      0.4,
      2.5,
      `Bitte die Obergrenze eingeben. ${PROFILE_HINT_DE.proteinMaxGPerKg}`
    ),
  }),
  z.object({ field: z.literal('weightSource'), value: weightSource }),
  z.object({
    field: z.literal('referenceWeightKg'),
    value: rangedNumber(
      30,
      250,
      `Bitte ein Gewicht eingeben. ${PROFILE_HINT_DE.referenceWeightKg}`
    ),
  }),
]);

/** The field names the questionnaire sends as a raw string. */
export type NutritionProfileNumberField =
  | 'birthYear'
  | 'heightCm'
  | 'proteinMaxGPerKg'
  | 'referenceWeightKg';

export type NutritionProfileFieldInput = z.input<
  typeof nutritionProfileFieldSchema
>;

export const nutrientKey = z.enum(
  NUTRIENT_KEYS as unknown as [string, ...string[]]
);

/**
 * An override may move the numbers, never the direction.
 *
 * There is no `direction` here and none on the table either: the catalogue owns
 * it. Otherwise "at least 30 g of fibre" could be turned into a limit by a data
 * row, and a whole class of inconsistency would become reachable.
 */
export const targetOverrideSchema = z
  .object({
    nutrientKey,
    min: z
      .union([z.literal('').transform(() => null), germanNumber])
      .nullable()
      .default(null),
    max: z
      .union([z.literal('').transform(() => null), germanNumber])
      .nullable()
      .default(null),
    reason: optionalText,
  })
  .refine((value) => value.min !== null || value.max !== null, {
    message: 'Bitte einen Wert eingeben',
    path: ['min'],
  })
  .refine(
    (value) => value.min === null || value.max === null || value.min <= value.max,
    { message: 'Der untere Wert muss kleiner sein', path: ['min'] }
  );

export const clearTargetOverrideSchema = z.object({ nutrientKey });

/**
 * A preparation's nutrient content, always per piece.
 *
 * The unit is the one printed on the package. `iu` is accepted here and refused
 * later for vitamin E, where the natural and synthetic forms differ by half and
 * the label does not always say which — see `convertNutrientAmount`.
 */
export const medicationNutrientSchema = z.object({
  medicationId: z.uuid(),
  nutrientKey,
  amountPerPiece: germanNumber.pipe(z.number().positive().max(1_000_000)),
  unit: z.enum(['g', 'mg', 'ug', 'iu']),
});

export const removeMedicationNutrientSchema = z.object({
  medicationId: z.uuid(),
  nutrientKey,
});
