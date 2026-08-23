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
  /**
   * Which version of the nutrient-goal framing was acknowledged.
   *
   * Null means the targets stay hidden. This is the on/off switch for the
   * feature: there is no state in which the numbers show without the sentence
   * saying they are orientation values rather than a prescription.
   */
  nutritionAckVersion: number | null;
  nutritionAckAt: Date | null;
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

export async function getUserSettings(userId: string): Promise<UserSettings> {
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
      nutritionAckVersion: null,
      nutritionAckAt: null,
    };
  }
  return {
    timeZone: row.timeZone,
    dayStartHour: row.dayStartHour,
    trackCycle: row.trackCycle,
    trackWeight: row.trackWeight,
    countTraceExposure: row.countTraceExposure,
    nutritionAckVersion: row.nutritionAckVersion,
    nutritionAckAt: row.nutritionAckAt,
  };
}
