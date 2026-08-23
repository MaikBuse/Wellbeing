/**
 * Reads for the progress screens.
 *
 * Three deliberate absences.
 *
 * There is no daily-log query here: `dailyLogRange` in `analysis.ts` already
 * returns every field the streak and the completeness score need, plus the
 * DAS28 tender count the RA-Tageswert milestone needs. A second query over the
 * same table would be a second definition of "what a day looks like".
 *
 * There is no medication query here either. `medication_intake` only has rows
 * where a dose was tapped, so counting rows would report perfect adherence
 * forever — `schedule.ts` spells this out. The due series is regenerated with
 * `expandDueDoses` from `scheduleVersionsRange` + `intakeRange`.
 *
 * And there is no `count(distinct log_date)` anywhere: a streak is measured
 * against a dense calendar, not against the days that happen to have rows. The
 * gap between the two is the entire quantity being measured.
 *
 * All of this rides on indexes that already exist — `meal_user_day_idx`,
 * `symptom_user_day_idx`, `daily_log_user_date_uq` — so no migration is needed.
 */
import { and, asc, eq, gte, lte, min } from 'drizzle-orm';
import { db } from '../index';
import { dailyLogs, mealItems, meals, symptomEntries } from '../schema';
import type { MealSlotKey } from '@/lib/scales';
import type { LogDate } from '@/lib/time';

export type MealSlotDay = { logDate: LogDate; slot: MealSlotKey };

/**
 * Distinct (day, slot) pairs that actually contain food.
 *
 * The inner join on `meal_item` is the point: quick-add creates the meal row
 * first and the item immediately after, and an empty meal left behind by an
 * abandoned edit is not a recorded meal. Counting it would let the streak
 * survive on rows that carry no exposure data at all.
 */
export async function mealSlotDays(
  userId: string,
  from: LogDate,
  to: LogDate
): Promise<MealSlotDay[]> {
  const rows = await db
    .selectDistinct({ logDate: meals.logDate, slot: meals.slot })
    .from(meals)
    .innerJoin(mealItems, eq(mealItems.mealId, meals.id))
    .where(
      and(
        eq(meals.userId, userId),
        gte(meals.logDate, from),
        lte(meals.logDate, to)
      )
    )
    .orderBy(asc(meals.logDate));

  return rows;
}

/** Logical days carrying at least one symptom entry. */
export async function symptomDays(
  userId: string,
  from: LogDate,
  to: LogDate
): Promise<LogDate[]> {
  const rows = await db
    .selectDistinct({ logDate: symptomEntries.logDate })
    .from(symptomEntries)
    .where(
      and(
        eq(symptomEntries.userId, userId),
        gte(symptomEntries.logDate, from),
        lte(symptomEntries.logDate, to)
      )
    );

  return rows.map((row) => row.logDate);
}

/**
 * The earliest day this user has any data on, or null for a brand-new account.
 *
 * Bounds the streak walk. Without it the calendar would start at whatever
 * arbitrary date the caller picked and every new account would open on a wall
 * of missed days.
 *
 * Three `min()` reads rather than one `least(...)` over sub-selects: each is an
 * index-only scan on a key that already exists, and the JS comparison is safe
 * because a LogDate is 'YYYY-MM-DD' — lexicographic order IS chronological
 * order for that shape.
 */
export async function firstActivityLogDate(
  userId: string
): Promise<LogDate | null> {
  const [mealMin, logMin, symptomMin] = await Promise.all([
    db
      .select({ first: min(meals.logDate) })
      .from(meals)
      .where(eq(meals.userId, userId)),
    db
      .select({ first: min(dailyLogs.logDate) })
      .from(dailyLogs)
      .where(eq(dailyLogs.userId, userId)),
    db
      .select({ first: min(symptomEntries.logDate) })
      .from(symptomEntries)
      .where(eq(symptomEntries.userId, userId)),
  ]);

  const candidates = [
    mealMin[0]?.first,
    logMin[0]?.first,
    symptomMin[0]?.first,
  ].filter((value): value is LogDate => typeof value === 'string');

  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a <= b ? a : b));
}
