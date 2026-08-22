import { z } from 'zod';
import {
  instant,
  onsetLag,
  optionalInt,
  optionalText,
  score,
  uuid,
} from './common';

export const createSymptomEntrySchema = z
  .object({
    mealId: uuid.nullable().optional(),
    occurredAt: instant.optional(),
    severity: score,
    onsetLag: onsetLag.nullable().optional(),
    onsetMinutes: optionalInt(0, 4320).optional(),
    durationMinutes: optionalInt(0, 4320).optional(),
    symptomTypeIds: z.array(uuid).max(20),
    note: optionalText,
  })
  // Mirrors the DB CHECK: a reaction attributed to a meal must say when it
  // started, because the lag bucket IS the analysis window.
  .refine((v) => !v.mealId || !!v.onsetLag, {
    message: 'Bitte angeben, wann die Reaktion aufgetreten ist',
    path: ['onsetLag'],
  });

export type CreateSymptomEntryInput = z.infer<typeof createSymptomEntrySchema>;
