import { z } from 'zod';
import {
  germanNumber,
  instant,
  mealSlot,
  optionalText,
  portionUnit,
  uuid,
} from './common';

export const createMealSchema = z.object({
  slot: mealSlot,
  occurredAt: instant.optional(),
  note: optionalText,
});

export const addMealItemSchema = z.object({
  mealId: uuid,
  foodId: uuid,
  quantity: germanNumber.pipe(z.number().positive().max(10000)),
  unit: portionUnit,
  portionId: uuid.optional().nullable(),
});

/** Quick-add: create the meal if it does not exist yet, then add one food. */
export const quickAddSchema = z.object({
  slot: mealSlot,
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  foodId: uuid,
});

export const updateMealItemSchema = z.object({
  mealItemId: uuid,
  quantity: germanNumber.pipe(z.number().positive().max(10000)),
  unit: portionUnit,
  portionId: uuid.optional().nullable(),
});

export const copyMealSchema = z.object({
  slot: mealSlot,
  targetLogDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type CreateMealInput = z.infer<typeof createMealSchema>;
export type QuickAddInput = z.infer<typeof quickAddSchema>;
