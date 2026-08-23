import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, pk, tsz, updatedAt } from './_helpers';

/**
 * Own user table, no Auth.js adapter: sessions are JWT, so there is no
 * per-request DB roundtrip, and the table shape stays ours. The Zitadel
 * subject is the external identity; every FK in the app points at `id`.
 */
export const appUsers = pgTable(
  'app_user',
  {
    id: pk(),
    zitadelSub: text('zitadel_sub').notNull(),
    email: text('email'),
    name: text('name'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('app_user_zitadel_sub_uq').on(t.zitadelSub)]
);

export const userSettings = pgTable(
  'user_setting',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    timeZone: text('time_zone').notNull().default('Europe/Berlin'),
    /**
     * The logical day starts at this local hour. A meal at 23:30 belongs to
     * that day, a symptom at 01:00 to the previous one.
     *
     * This is data, not config: changing it requires backfilling every
     * log_date (src/db/scripts/recompute-log-dates.ts).
     */
    dayStartHour: smallint('day_start_hour').notNull().default(4),
    trackCycle: boolean('track_cycle').notNull().default(true),
    trackWeight: boolean('track_weight').notNull().default(true),
    /** Count 'trace' tag assignments as exposure in the analysis. */
    countTraceExposure: boolean('count_trace_exposure')
      .notNull()
      .default(false),
    /**
     * Whether the mascot appears at all.
     *
     * A separate flag from `nutritionAckVersion` on purpose: that one gates the
     * NUMBERS behind their framing, this one gates a cartoon. Someone can want
     * the targets and not want a face commenting on them, and there is no other
     * way to say so.
     */
    showMascot: boolean('show_mascot').notNull().default(true),
    /*
     * Nutrient targets are hidden until the wording about them being
     * orientation values rather than a prescription has been acknowledged.
     * This IS the on/off switch for the feature — there is no second flag, so
     * there is no state where targets show without the framing around them.
     *
     * The version is a code constant (NUTRITION_DISCLAIMER_VERSION). Raising it
     * hides the feature until the new wording is acknowledged, which is why the
     * acknowledgement is not on the versioned profile: copying it into every
     * profile edit would silently re-date a consent.
     */
    nutritionAckVersion: smallint('nutrition_ack_version'),
    nutritionAckAt: tsz('nutrition_ack_at'),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('day_start_hour_range', sql`${t.dayStartHour} between 0 and 12`),
  ]
);

export const lastSeenColumn = tsz;
