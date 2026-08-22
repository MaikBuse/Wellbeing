import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { appUsers } from './auth';
import { joints } from './lookup';
import { createdAt, num, pk, score, updatedAt } from './_helpers';
import { jointSide, menstrualEventKind } from './enums';

export const dailyLogs = pgTable(
  'daily_log',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    logDate: date('log_date', { mode: 'string' }).notNull(),

    // Rheumatoid arthritis
    jointPain: score('joint_pain'),
    morningStiffnessMinutes: integer('morning_stiffness_minutes'),
    fatigue: score('fatigue'),
    wellbeing: score('wellbeing'),
    /**
     * The single most valuable analytics field on this table: RA flares last
     * weeks, and any food eaten during one looks guilty unless flare days can
     * be excluded or stratified. One tap in the UI.
     */
    isFlare: boolean('is_flare').notNull().default(false),

    // Confounders — without these every flare gets blamed on food.
    sleepMinutes: integer('sleep_minutes'),
    sleepQuality: score('sleep_quality'),
    stress: score('stress'),
    activityMinutes: integer('activity_minutes'),
    activityIntensity: score('activity_intensity'),

    // Digestion, weight, fluids
    bristolTypical: smallint('bristol_typical'),
    bowelMovements: smallint('bowel_movements'),
    weightKg: num('weight_kg', 5, 2),
    waterMl: integer('water_ml'),

    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('daily_log_user_date_uq').on(t.userId, t.logDate),
    check(
      'daily_log_bristol_range',
      sql`${t.bristolTypical} is null or ${t.bristolTypical} between 1 and 7`
    ),
    check(
      'daily_log_scores_range',
      sql`(${t.jointPain} is null or ${t.jointPain} between 0 and 10)
        and (${t.fatigue} is null or ${t.fatigue} between 0 and 10)
        and (${t.wellbeing} is null or ${t.wellbeing} between 0 and 10)
        and (${t.stress} is null or ${t.stress} between 0 and 10)
        and (${t.sleepQuality} is null or ${t.sleepQuality} between 0 and 10)
        and (${t.activityIntensity} is null or ${t.activityIntensity} between 0 and 10)`
    ),
    check(
      'daily_log_stiffness_sane',
      sql`${t.morningStiffnessMinutes} is null
        or ${t.morningStiffnessMinutes} between 0 and 1440`
    ),
  ]
);

export const dailyLogJoints = pgTable(
  'daily_log_joint',
  {
    dailyLogId: uuid('daily_log_id')
      .notNull()
      .references(() => dailyLogs.id, { onDelete: 'cascade' }),
    jointId: uuid('joint_id')
      .notNull()
      .references(() => joints.id, { onDelete: 'restrict' }),
    side: jointSide('side').notNull().default('both'),
    severity: score('severity'),
    isSwollen: boolean('is_swollen').notNull().default(false),
    isTender: boolean('is_tender').notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.dailyLogId, t.jointId, t.side] })]
);

/**
 * Cycle day and phase are DERIVED from these events, never typed by hand — a
 * manually entered cycle day rots within weeks, and stratifying by cycle
 * phase matters because RA symptoms fluctuate with it.
 */
export const menstrualEvents = pgTable(
  'menstrual_event',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    eventDate: date('event_date', { mode: 'string' }).notNull(),
    kind: menstrualEventKind('kind').notNull(),
    flow: smallint('flow'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('menstrual_event_uq').on(t.userId, t.eventDate, t.kind),
    check(
      'menstrual_flow_range',
      sql`${t.flow} is null or ${t.flow} between 0 and 3`
    ),
  ]
);
