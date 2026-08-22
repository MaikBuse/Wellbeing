import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { appUsers } from './auth';
import { foodTagDefs } from './lookup';
import { foods } from './food';
import { createdAt, num, pk } from './_helpers';
import { challengeVerdict, phaseKind, protocolStatus, ruleMode } from './enums';

/**
 * Phase 3. The tables exist from the first migration so that the analytics can
 * already exclude days inside an active protocol — including them would make
 * the observational ranking circular ("gluten looks bad because she only
 * avoided it when she felt bad").
 */
export const eliminationProtocols = pgTable(
  'elimination_protocol',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    hypothesis: text('hypothesis'),
    status: protocolStatus('status').notNull().default('planned'),
    startedOn: date('started_on', { mode: 'string' }),
    endedOn: date('ended_on', { mode: 'string' }),
    createdAt: createdAt(),
  },
  (t) => [index('protocol_user_idx').on(t.userId, t.status)]
);

export const eliminationPhases = pgTable(
  'elimination_phase',
  {
    id: pk(),
    protocolId: uuid('protocol_id')
      .notNull()
      .references(() => eliminationProtocols.id, { onDelete: 'cascade' }),
    kind: phaseKind('kind').notNull(),
    name: text('name').notNull(),
    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    endsOn: date('ends_on', { mode: 'string' }),
    plannedDays: smallint('planned_days'),
    sortOrder: smallint('sort_order').notNull(),
    note: text('note'),
  },
  (t) => [
    index('phase_protocol_idx').on(t.protocolId, t.startsOn),
    check(
      'phase_dates_ordered',
      sql`${t.endsOn} is null or ${t.endsOn} >= ${t.startsOn}`
    ),
  ]
);

export const eliminationRules = pgTable(
  'elimination_rule',
  {
    id: pk(),
    phaseId: uuid('phase_id')
      .notNull()
      .references(() => eliminationPhases.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id').references(() => foodTagDefs.id, {
      onDelete: 'cascade',
    }),
    foodId: uuid('food_id').references(() => foods.id, { onDelete: 'cascade' }),
    mode: ruleMode('mode').notNull(),
    doseNote: text('dose_note'),
  },
  (t) => [
    index('elimination_rule_phase_idx').on(t.phaseId),
    // Exactly one of tag / food.
    check(
      'elimination_rule_target',
      sql`(${t.tagId} is not null) <> (${t.foodId} is not null)`
    ),
  ]
);

/** Compliance is derived per day, never stored — it would go stale the moment
 * a food is re-tagged. */
export const eliminationResults = pgTable(
  'elimination_result',
  {
    id: pk(),
    phaseId: uuid('phase_id')
      .notNull()
      .references(() => eliminationPhases.id, { onDelete: 'cascade' }),
    verdict: challengeVerdict('verdict').notNull(),
    meanOutcomeBefore: num('mean_outcome_before'),
    meanOutcomeDuring: num('mean_outcome_during'),
    note: text('note'),
    decidedAt: createdAt(),
  },
  (t) => [uniqueIndex('elimination_result_phase_uq').on(t.phaseId)]
);
