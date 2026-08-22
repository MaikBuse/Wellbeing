import { z } from 'zod';
import {
  germanNumber,
  instant,
  logDate,
  mealSlot,
  optionalText,
  portionUnit,
  timeOfDay,
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

/**
 * Quick-add: create the meal if it does not exist yet, then add one food.
 *
 * `logDate` is the day being looked at, not a day assignment: the server builds
 * the instant from it and derives the stored log date back out of that instant.
 * The time of the new meal is proposed by the server and corrected afterwards
 * with `setMealTime`, so it is not part of this payload.
 */
export const quickAddSchema = z.object({
  slot: mealSlot,
  logDate,
  foodId: uuid,
});

export const setMealTimeSchema = z.object({
  mealId: uuid,
  timeOfDay,
});

export const updateMealItemSchema = z.object({
  mealItemId: uuid,
  quantity: germanNumber.pipe(z.number().positive().max(10000)),
  unit: portionUnit,
  portionId: uuid.optional().nullable(),
});

export const copyMealSchema = z.object({
  slot: mealSlot,
  targetLogDate: logDate,
});

export type CreateMealInput = z.infer<typeof createMealSchema>;
export type QuickAddInput = z.infer<typeof quickAddSchema>;
