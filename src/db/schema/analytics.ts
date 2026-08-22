import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { appUsers } from './auth';
import { createdAt, pk } from './_helpers';

/**
 * Persisted analysis runs (phase 2).
 *
 * The ranking is recomputed weekly, not per request: reacting to a
 * daily-refreshed top result is textbook overfitting. Storing runs also gives
 * instant page loads, reproducibility, and a "has been top for 3 weeks"
 * stability indicator, which is the cheap antidote.
 */
export const analysisRuns = pgTable(
  'analysis_run',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // 'suspicion_ranking'
    rangeFrom: date('range_from', { mode: 'string' }).notNull(),
    rangeTo: date('range_to', { mode: 'string' }).notNull(),
    /** Thresholds, exclusions and the PRNG seed, so a run is reproducible. */
    params: jsonb('params').$type<Record<string, unknown>>().notNull(),
    results: jsonb('results').$type<unknown[]>().notNull(),
    computedAt: createdAt(),
    durationMs: integer('duration_ms'),
  },
  (t) => [index('analysis_run_idx').on(t.userId, t.kind, t.computedAt.desc())]
);
