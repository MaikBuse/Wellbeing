import { date, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { appUsers } from './auth';
import { createdAt, pk, tsz } from './_helpers';

/**
 * Acknowledged milestones — and nothing else.
 *
 * The streak, the completeness score and whether a milestone is reached are all
 * DERIVED from the day rows on every read (`src/services/progress/`). None of
 * them is stored, for the same reason `elimination_result` does not store
 * compliance: a cached number goes stale the moment a past day is corrected,
 * and a motivation feature that disagrees with the data it is motivating is
 * worse than no feature.
 *
 * What cannot be derived is "has this already been celebrated". A row here
 * means the milestone's one-time celebration has been dismissed, so it never
 * pops up again. `achieved_on` rides along because it is known at that moment
 * and gives the milestone grid a stable date to print — deriving it later would
 * make the date wander whenever an old day is edited.
 */
export const achievements = pgTable(
  'achievement',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    /** A key from MILESTONES in `src/services/progress/milestones.ts`. */
    key: text('key').notNull(),
    achievedOn: date('achieved_on', { mode: 'string' }).notNull(),
    acknowledgedAt: tsz('acknowledged_at').notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('achievement_user_key_uq').on(t.userId, t.key)]
);
