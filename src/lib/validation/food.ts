import { z } from 'zod';
import { optionalGermanNumber, optionalText, uuid } from './common';

const per100 = optionalGermanNumber.optional();

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
  kcal100: per100,
  protein100: per100,
  fat100: per100,
  carbs100: per100,
  sugar100: per100,
  fiber100: per100,
  salt100: per100,
  defaultPortionGrams: per100,
  tagIds: z.array(uuid).max(60).optional(),
});

export const updateFoodTagsSchema = z.object({
  foodId: uuid,
  tagIds: z.array(uuid).max(60),
});

export const barcodeSchema = z.object({
  barcode: z
    .string()
    .trim()
    .regex(/^\d{6,14}$/, 'Ungültiger Barcode'),
});

export type CreateFoodInput = z.infer<typeof createFoodSchema>;
