import { z } from 'zod';

/**
 * German keypads produce "12,5" and Number('12,5') is NaN, so every numeric
 * form field goes through here rather than z.coerce.number().
 */
export const germanNumber = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const normalised = value.replace(/\s/g, '').replace(',', '.');
    const parsed = Number(normalised);
    if (normalised === '' || !Number.isFinite(parsed)) {
      ctx.addIssue({ code: 'custom', message: 'Bitte eine Zahl eingeben' });
      return z.NEVER;
    }
    return parsed;
  });

export const optionalGermanNumber = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === '') return null;
    const normalised = value.replace(/\s/g, '').replace(',', '.');
    const parsed = Number(normalised);
    if (!Number.isFinite(parsed)) {
      ctx.addIssue({ code: 'custom', message: 'Bitte eine Zahl eingeben' });
      return z.NEVER;
    }
    return parsed;
  });

export const score = z.coerce.number().int().min(0).max(10);
export const optionalScore = z
  .union([z.literal(''), z.coerce.number().int().min(0).max(10)])
  .transform((v) => (v === '' ? null : v));

export const optionalInt = (min: number, max: number) =>
  z
    .union([z.literal(''), z.coerce.number().int().min(min).max(max)])
    .transform((v) => (v === '' ? null : v));

export const logDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiges Datum');

/**
 * A wall-clock time of day. Paired with a log date it is what a client may send
 * about *when* something happened; the instant is built server-side, in the
 * user's own zone, by src/lib/time.ts.
 */
export const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Ungültige Uhrzeit');

export const uuid = z.string().uuid('Ungültige ID');

/**
 * Clients send an instant, never a log_date — a device with a wrong clock or
 * time zone must not be able to poison the dataset with a bad day assignment.
 */
export const instant = z.coerce.date();

export const optionalText = z
  .string()
  .trim()
  .max(2000)
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

export const mealSlot = z.enum([
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'drink',
]);

export const onsetLag = z.enum([
  'immediate',
  'early',
  'mid',
  'late',
  'next_day',
]);

export const portionUnit = z.enum(['g', 'ml', 'piece', 'portion']);
