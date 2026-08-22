import { z } from 'zod';
import { germanNumber, logDate, optionalText, uuid } from './common';

const doseUnit = z.enum(['mg', 'ug', 'g', 'ml', 'iu', 'piece']);

export const createMedicationSchema = z
  .object({
    name: z.string().trim().min(1, 'Name fehlt').max(200),
    activeSubstance: optionalText,
    form: z.enum([
      'tablet',
      'capsule',
      'injection',
      'infusion',
      'drops',
      'spray',
      'ointment',
      'other',
    ]),
    category: z.enum([
      'csdmard',
      'bdmard',
      'tsdmard',
      'nsaid',
      'steroid',
      'analgesic',
      'supplement',
      'other',
    ]),
    scheduleKind: z.enum(['daily', 'weekly', 'interval_days', 'as_needed']),
    weekday: z
      .union([z.literal(''), z.coerce.number().int().min(0).max(6)])
      .transform((v) => (v === '' ? null : v))
      .optional(),
    intervalDays: z
      .union([z.literal(''), z.coerce.number().int().min(1).max(365)])
      .transform((v) => (v === '' ? null : v))
      .optional(),
    anchorDate: z.union([z.literal(''), logDate]).optional(),
    timeOfDay: z
      .string()
      .regex(/^\d{2}:\d{2}$/, 'Uhrzeit im Format HH:MM')
      .default('08:00'),
    doseAmount: germanNumber.pipe(z.number().positive().max(100000)),
    doseUnit,
    note: optionalText,
  })
  .refine((v) => v.scheduleKind !== 'weekly' || v.weekday !== null, {
    message: 'Bitte einen Wochentag wählen',
    path: ['weekday'],
  })
  .refine(
    (v) =>
      v.scheduleKind !== 'interval_days' ||
      (!!v.intervalDays && !!v.anchorDate && v.anchorDate !== ''),
    {
      message: 'Intervall und Startdatum werden benötigt',
      path: ['intervalDays'],
    }
  );

export const logIntakeSchema = z.object({
  scheduleDoseId: uuid,
  plannedLogDate: logDate,
  status: z.enum(['taken', 'skipped']),
});

export const logAsNeededSchema = z.object({
  medicationId: uuid,
  doseAmount: germanNumber.pipe(z.number().positive().max(100000)),
  doseUnit,
  note: optionalText,
});

/**
 * A dose change closes the old schedule and opens a new one — it is never an
 * in-place edit, because the previous dose is a fact about a period of time and
 * a covariate in the analysis.
 */
export const changeDoseSchema = z.object({
  medicationId: uuid,
  effectiveFrom: logDate,
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/),
  doseAmount: germanNumber.pipe(z.number().positive().max(100000)),
  doseUnit,
});

export const stopMedicationSchema = z.object({
  medicationId: uuid,
  endedOn: logDate,
});

export type CreateMedicationInput = z.infer<typeof createMedicationSchema>;
