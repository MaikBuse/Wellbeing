import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { appUsers } from './auth';
import { meals } from './meal';
import { symptomTypes } from './lookup';
import { createdAt, pk, score, tsz, updatedAt } from './_helpers';
import { onsetLag } from './enums';

/**
 * `mealId` is nullable on purpose: a flare at 03:00 belongs to no single meal,
 * and dropping those entries would lose exactly the data that matters.
 *
 * Several entries per meal are allowed — bloating after an hour and joint pain
 * the next morning are different rows with different lags. Lag-window analysis
 * depends on that.
 */
export const symptomEntries = pgTable(
  'symptom_entry',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    mealId: uuid('meal_id').references(() => meals.id, {
      onDelete: 'set null',
    }),
    occurredAt: tsz('occurred_at').notNull(),
    logDate: date('log_date', { mode: 'string' }).notNull(),
    severity: score('severity').notNull(),
    onsetLag: onsetLag('onset_lag'),
    onsetMinutes: integer('onset_minutes'),
    durationMinutes: integer('duration_minutes'),
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('symptom_user_day_idx').on(t.userId, t.logDate),
    index('symptom_meal_idx').on(t.mealId),
    check('symptom_severity_range', sql`${t.severity} between 0 and 10`),
    check(
      'symptom_lag_requires_meal',
      sql`${t.mealId} is null or ${t.onsetLag} is not null`
    ),
  ]
);

export const symptomEntrySymptoms = pgTable(
  'symptom_entry_symptom',
  {
    entryId: uuid('entry_id')
      .notNull()
      .references(() => symptomEntries.id, { onDelete: 'cascade' }),
    symptomTypeId: uuid('symptom_type_id')
      .notNull()
      .references(() => symptomTypes.id, { onDelete: 'restrict' }),
    /** Optional per-symptom severity — column exists, UI comes in phase 2. */
    severity: score('severity'),
  },
  (t) => [
    primaryKey({ columns: [t.entryId, t.symptomTypeId] }),
    index('symptom_entry_symptom_type_idx').on(t.symptomTypeId),
  ]
);
