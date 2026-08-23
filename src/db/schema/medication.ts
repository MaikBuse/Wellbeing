import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  smallint,
  text,
  time,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { appUsers } from './auth';
import { createdAt, num, pk, tsz, updatedAt } from './_helpers';
import {
  doseUnit,
  intakeStatus,
  medCategory,
  medForm,
  scheduleKind,
} from './enums';

export const medications = pgTable(
  'medication',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(), // Handelsname
    activeSubstance: text('active_substance'), // 'Methotrexat'
    form: medForm('form').notNull().default('tablet'),
    strengthAmount: num('strength_amount'),
    strengthUnit: doseUnit('strength_unit'),
    /**
     * 'steroid' is not cosmetic: the daily prednisolone-equivalent dose is a
     * covariate in the analysis, because a food eaten while tapering cortisone
     * would otherwise look protective.
     */
    category: medCategory('category').notNull().default('other'),
    startedOn: date('started_on', { mode: 'string' }),
    endedOn: date('ended_on', { mode: 'string' }),
    isActive: boolean('is_active').notNull().default(true),
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('medication_user_idx').on(t.userId, t.isActive)]
);

/**
 * A dose change is HISTORY, not an edit: MTX 15 -> 20 mg and a prednisolone
 * taper are facts about a period of time. Close `validTo` on the old schedule
 * and insert a new one; never mutate an existing row's dose.
 */
export const medicationSchedules = pgTable(
  'medication_schedule',
  {
    id: pk(),
    medicationId: uuid('medication_id')
      .notNull()
      .references(() => medications.id, { onDelete: 'cascade' }),
    kind: scheduleKind('kind').notNull(),
    weekday: smallint('weekday'), // 0 = Monday .. 6 = Sunday, for 'weekly'
    intervalDays: smallint('interval_days'), // e.g. 14, for 'interval_days'
    anchorDate: date('anchor_date', { mode: 'string' }),
    validFrom: date('valid_from', { mode: 'string' }).notNull(),
    validTo: date('valid_to', { mode: 'string' }), // null = open ended
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [
    index('med_schedule_med_idx').on(t.medicationId, t.validFrom),
    check(
      'weekly_needs_weekday',
      sql`${t.kind} <> 'weekly' or ${t.weekday} between 0 and 6`
    ),
    check(
      'interval_needs_anchor',
      sql`${t.kind} <> 'interval_days'
        or (${t.intervalDays} > 0 and ${t.anchorDate} is not null)`
    ),
    check(
      'schedule_dates_ordered',
      sql`${t.validTo} is null or ${t.validTo} >= ${t.validFrom}`
    ),
  ]
);

export const medicationScheduleDoses = pgTable(
  'medication_schedule_dose',
  {
    id: pk(),
    scheduleId: uuid('schedule_id')
      .notNull()
      .references(() => medicationSchedules.id, { onDelete: 'cascade' }),
    timeOfDay: time('time_of_day').notNull(), // '08:00'
    doseAmount: num('dose_amount').notNull(),
    doseUnit: doseUnit('dose_unit').notNull(),
    sortOrder: smallint('sort_order').notNull().default(0),
  },
  (t) => [uniqueIndex('med_schedule_dose_uq').on(t.scheduleId, t.timeOfDay)]
);

/**
 * Due doses are NOT materialised by a cron. They come from the pure function
 * expandDueDoses() (src/services/medication/schedule.ts) and rows are created
 * lazily on tap via ON CONFLICT (schedule_dose_id, planned_log_date).
 *
 * Consequence: an untouched past dose has no row and is implicitly missed —
 * adherence analytics must regenerate the expected series with the same
 * function.
 */
export const medicationIntakes = pgTable(
  'medication_intake',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    medicationId: uuid('medication_id')
      .notNull()
      .references(() => medications.id, { onDelete: 'restrict' }),
    // Named explicitly: the auto-generated name would be 65 characters, and
    // Postgres silently truncates identifiers at 63 — which then drifts from
    // the drizzle snapshot and produces a phantom diff on the next generate.
    scheduleDoseId: uuid('schedule_dose_id'),
    /** null => taken as needed, outside any plan. */
    plannedLogDate: date('planned_log_date', { mode: 'string' }),
    plannedAt: tsz('planned_at'),
    takenAt: tsz('taken_at'),
    logDate: date('log_date', { mode: 'string' }).notNull(),
    status: intakeStatus('status').notNull(),
    doseAmount: num('dose_amount').notNull(),
    doseUnit: doseUnit('dose_unit').notNull(),
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.scheduleDoseId],
      foreignColumns: [medicationScheduleDoses.id],
      name: 'intake_schedule_dose_fk',
    }).onDelete('set null'),
    // Makes checking a dose off idempotent.
    uniqueIndex('intake_planned_uq')
      .on(t.scheduleDoseId, t.plannedLogDate)
      .where(sql`${t.plannedLogDate} is not null`),
    index('intake_user_day_idx').on(t.userId, t.logDate),
    index('intake_med_day_idx').on(t.medicationId, t.logDate),
  ]
);

/**
 * What nutrients a preparation carries, so a supplement can count towards a
 * nutrient target.
 *
 * A table rather than a column on `medication`, because the first fish-oil
 * capsule carries EPA, DHA and vitamin E at once.
 *
 * CONVENTION instead of a discriminator: the amount is always "per piece", and
 * a nutrient-carrying medication must be scheduled in `dose_unit = 'piece'`.
 * Vitamin D at 1000 IU per drop with `dose_amount = 2` is 2000 IU. That removes
 * a `basis` column and a whole class of unit errors; the price is one data
 * entry rule, enforced in the action and in db:check.
 *
 * Only `taken` intakes count towards a target — deliberately unlike
 * `steroid.ts`, which regenerates the planned series through `expandDueDoses`
 * because plan-plus-correction is the best estimate of EXPOSURE. Here the
 * question is what was actually swallowed, and an untapped past dose has no
 * row at all. Regenerating one would invent vitamin D nobody took.
 */
export const medicationNutrients = pgTable(
  'medication_nutrient',
  {
    id: pk(),
    medicationId: uuid('medication_id')
      .notNull()
      .references(() => medications.id, { onDelete: 'cascade' }),
    /** A key from NUTRIENT_META. */
    nutrientKey: text('nutrient_key').notNull(),
    amountPerPiece: num('amount_per_piece', 12, 3).notNull(),
    /** 'mg' | 'ug' | 'g' | 'iu' — the unit printed on the package. */
    unit: text('unit').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('medication_nutrient_uq').on(t.medicationId, t.nutrientKey),
    check('medn_amount_positive', sql`${t.amountPerPiece} > 0`),
  ]
);
