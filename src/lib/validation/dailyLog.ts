import { z } from 'zod';
import {
  logDate,
  optionalGermanNumber,
  optionalInt,
  optionalScore,
  optionalText,
} from './common';

/**
 * Everything is optional and the form autosaves per field: a daily check-in
 * that demands completeness gets skipped on bad days, and bad days are exactly
 * the ones the analysis needs.
 */
export const dailyLogSchema = z.object({
  logDate,
  jointPain: optionalScore.optional(),
  morningStiffnessMinutes: optionalInt(0, 1440).optional(),
  fatigue: optionalScore.optional(),
  wellbeing: optionalScore.optional(),
  isFlare: z
    .union([
      z.boolean(),
      z.literal('on'),
      z.literal('true'),
      z.literal('false'),
    ])
    .transform((v) => v === true || v === 'on' || v === 'true')
    .optional(),
  sleepMinutes: optionalInt(0, 1440).optional(),
  sleepQuality: optionalScore.optional(),
  stress: optionalScore.optional(),
  activityMinutes: optionalInt(0, 1440).optional(),
  activityIntensity: optionalScore.optional(),
  bristolTypical: optionalInt(1, 7).optional(),
  bowelMovements: optionalInt(0, 30).optional(),
  weightKg: optionalGermanNumber.optional(),
  waterMl: optionalInt(0, 10000).optional(),
  note: optionalText,
});

export const toggleJointSchema = z.object({
  logDate,
  jointKey: z.string().min(1).max(40),
  side: z.enum(['left', 'right', 'both']),
});

export const menstrualEventSchema = z.object({
  eventDate: logDate,
  kind: z.enum(['period_start', 'period_end', 'spotting']),
});

export type DailyLogInput = z.infer<typeof dailyLogSchema>;
