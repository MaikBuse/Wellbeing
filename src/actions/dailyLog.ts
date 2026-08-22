'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { requireUserWithSettings } from '@/auth.helpers';
import { db } from '@/db';
import {
  dailyLogJoints,
  dailyLogs,
  joints,
  menstrualEvents,
} from '@/db/schema';
import {
  dailyLogSchema,
  menstrualEventSchema,
  toggleJointSchema,
} from '@/lib/validation/dailyLog';
import type { ActionResult } from './meals';

type DailyLogField = keyof typeof dailyLogs.$inferInsert;

/**
 * Autosave for a single field: the daily check-in has no submit button, so
 * every chip tap writes immediately. A form that demands completeness gets
 * skipped on bad days, and bad days are the ones that matter most.
 */
export async function saveDailyLogField(input: {
  logDate: string;
  field: string;
  value: string | boolean | null;
}): Promise<ActionResult> {
  const { user } = await requireUserWithSettings();

  const parsed = dailyLogSchema.safeParse({
    logDate: input.logDate,
    [input.field]:
      typeof input.value === 'boolean' ? input.value : (input.value ?? ''),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Eingabe ungültig',
    };
  }

  const field = input.field as DailyLogField;
  const value = (parsed.data as Record<string, unknown>)[input.field];
  if (value === undefined) return { ok: false, error: 'Unbekanntes Feld' };

  await db
    .insert(dailyLogs)
    .values({
      userId: user.id,
      logDate: parsed.data.logDate,
      [field]: value,
    } as typeof dailyLogs.$inferInsert)
    .onConflictDoUpdate({
      target: [dailyLogs.userId, dailyLogs.logDate],
      set: { [field]: value, updatedAt: new Date() },
    });

  revalidatePath('/');
  return { ok: true };
}

export async function toggleJoint(input: {
  logDate: string;
  jointKey: string;
  side: 'left' | 'right' | 'both';
}): Promise<ActionResult> {
  const { user } = await requireUserWithSettings();
  const parsed = toggleJointSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Eingabe ungültig' };

  const [joint] = await db
    .select({ id: joints.id })
    .from(joints)
    .where(eq(joints.key, parsed.data.jointKey))
    .limit(1);
  if (!joint) return { ok: false, error: 'Gelenk unbekannt' };

  // The daily log row has to exist before joints can hang off it.
  const [log] = await db
    .insert(dailyLogs)
    .values({ userId: user.id, logDate: parsed.data.logDate })
    .onConflictDoUpdate({
      target: [dailyLogs.userId, dailyLogs.logDate],
      set: { updatedAt: new Date() },
    })
    .returning({ id: dailyLogs.id });

  const existing = await db
    .select({ jointId: dailyLogJoints.jointId })
    .from(dailyLogJoints)
    .where(
      and(
        eq(dailyLogJoints.dailyLogId, log.id),
        eq(dailyLogJoints.jointId, joint.id),
        eq(dailyLogJoints.side, parsed.data.side)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .delete(dailyLogJoints)
      .where(
        and(
          eq(dailyLogJoints.dailyLogId, log.id),
          eq(dailyLogJoints.jointId, joint.id),
          eq(dailyLogJoints.side, parsed.data.side)
        )
      );
  } else {
    await db.insert(dailyLogJoints).values({
      dailyLogId: log.id,
      jointId: joint.id,
      side: parsed.data.side,
    });
  }

  revalidatePath('/');
  return { ok: true };
}

/** Cycle day and phase are derived from these events, never typed by hand. */
export async function logMenstrualEvent(input: {
  eventDate: string;
  kind: 'period_start' | 'period_end' | 'spotting';
}): Promise<ActionResult> {
  const { user } = await requireUserWithSettings();
  const parsed = menstrualEventSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Eingabe ungültig' };

  await db
    .insert(menstrualEvents)
    .values({
      userId: user.id,
      eventDate: parsed.data.eventDate,
      kind: parsed.data.kind,
    })
    .onConflictDoNothing();

  revalidatePath('/');
  return { ok: true };
}
