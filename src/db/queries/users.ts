import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { db } from '../index';
import { appUsers, userSettings } from '../schema';
import { DEFAULT_DAY_START_HOUR, DEFAULT_TIME_ZONE } from '@/lib/time';

export type UserSettings = {
  timeZone: string;
  dayStartHour: number;
  trackCycle: boolean;
  trackWeight: boolean;
  countTraceExposure: boolean;
  /** Whether the mascot appears. Independent of the target framing. */
  showMascot: boolean;
  /** Whether the figure stands in the corner. Narrower than `showMascot`. */
  showMascotFigure: boolean;
};

/**
 * Maps the Zitadel subject onto our own user row. Idempotent, one statement,
 * called from the jwt callback on initial sign-in only.
 */
export async function upsertUserFromZitadel(input: {
  sub: string;
  email: string | null;
  name: string | null;
}): Promise<{ id: string }> {
  const [user] = await db
    .insert(appUsers)
    .values({
      zitadelSub: input.sub,
      email: input.email,
      name: input.name,
    })
    .onConflictDoUpdate({
      target: appUsers.zitadelSub,
      set: { email: input.email, name: input.name, updatedAt: new Date() },
    })
    .returning({ id: appUsers.id });

  // Settings row is created lazily but always exists after first sign-in, so
  // no read path has to cope with its absence.
  await db
    .insert(userSettings)
    .values({ userId: user.id })
    .onConflictDoNothing();

  return user;
}

/**
 * Wrapped in `cache()` because the companion moved into the (app) layout: the
 * layout and the page beneath it both ask, within one request, and this is one
 * row keyed by one string. React de-duplicates on referential equality of the
 * arguments, which a plain userId satisfies and an options object would not —
 * see `dayNutrition` in `services/nutrition/loader.ts` for the same problem
 * solved the same way.
 */
export const getUserSettings = cache(async function getUserSettings(
  userId: string
): Promise<UserSettings> {
  const [row] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (!row) {
    return {
      timeZone: DEFAULT_TIME_ZONE,
      dayStartHour: DEFAULT_DAY_START_HOUR,
      trackCycle: true,
      trackWeight: true,
      countTraceExposure: false,
      showMascot: true,
      showMascotFigure: true,
    };
  }
  return {
    timeZone: row.timeZone,
    dayStartHour: row.dayStartHour,
    trackCycle: row.trackCycle,
    trackWeight: row.trackWeight,
    countTraceExposure: row.countTraceExposure,
    showMascot: row.showMascot,
    showMascotFigure: row.showMascotFigure,
  };
});
