import { z } from 'zod';
import { NUTRIENT_KEYS } from '@/lib/nutrients';
import { germanNumber, optionalInt, optionalText } from './common';

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
 * One field of the questionnaire.
 *
 * A discriminated union rather than a partial object: it makes "save this one
 * answer" the only shape the action accepts, so a stray extra key cannot ride
 * along on an autosave.
 */
export const nutritionProfileFieldSchema = z.discriminatedUnion('field', [
  z.object({ field: z.literal('referenceSex'), value: referenceSex.nullable() }),
  z.object({
    field: z.literal('birthYear'),
    value: optionalInt(1900, CURRENT_YEAR_MAX),
  }),
  z.object({ field: z.literal('heightCm'), value: optionalInt(100, 250) }),
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
    value: z
      .union([
        z.literal('').transform(() => null),
        germanNumber.pipe(z.number().min(0.4).max(2.5)),
      ])
      .nullable(),
  }),
  z.object({ field: z.literal('weightSource'), value: weightSource }),
  z.object({
    field: z.literal('referenceWeightKg'),
    value: z
      .union([
        z.literal('').transform(() => null),
        germanNumber.pipe(z.number().min(30).max(250)),
      ])
      .nullable(),
  }),
]);

export type NutritionProfileFieldInput = z.input<
  typeof nutritionProfileFieldSchema
>;

export const nutritionAckSchema = z.object({
  acknowledged: z.boolean(),
});

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
