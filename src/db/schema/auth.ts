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
import { mascotCharacter } from './enums';

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
     * Its own flag, because wanting the targets and wanting a face to comment
     * on them are two different wishes, and there is no other way to say so.
     */
    showMascot: boolean('show_mascot').notNull().default(true),
    /**
     * Whether the FIGURE stands in the corner.
     *
     * The finer half of the question above. `show_mascot` is the companion —
     * turn it off and the sentences on the day and progress screens go with it.
     * This one is only the drawing: off, the corner is empty and the reading of
     * the day stays where it is readable, as text. Wanting the verdict without
     * a cartoon on top of it had no way to be said before.
     */
    showMascotFigure: boolean('show_mascot_figure').notNull().default(true),
    /**
     * Which of the two figures. Amber by default.
     *
     * Amber ('merv') and not violet: its tone sits almost exactly on
     * --color-primary, so the companion reads as part of this app rather than
     * as a visitor from another one. `0c41f27` picked violet when it reduced two
     * figures to one, and that was the wrong half of the trade.
     *
     * NOT called `color`, although the two differ mainly by colour: the colour
     * is a keyframe of the figure inside the .riv and nothing can set it (see
     * `rive-asset.ts`). A column named after the colour would promise a palette
     * that does not exist.
     */
    mascotCharacter: mascotCharacter('mascot_character')
      .notNull()
      .default('merv'),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('day_start_hour_range', sql`${t.dayStartHour} between 0 and 12`),
  ]
);

export const lastSeenColumn = tsz;
