'use server';

import { requireUserForAction } from '@/auth.helpers';
import { db } from '@/db';
import { userSettings } from '@/db/schema';
import { revalidateSettings } from '@/lib/revalidate';
import { updateSettingsSchema } from '@/lib/validation/settings';
import type { ActionResult } from './meals';

/**
 * Toggles whether the weight field appears in the daily check.
 *
 * The settings row is created on first sign-in, but this upserts anyway: a
 * plain update against a missing row would silently succeed with zero rows
 * affected and the toggle would spring back with no error.
 */
export async function setTrackWeight(input: {
  trackWeight: boolean;
}): Promise<ActionResult> {
  const user = await requireUserForAction();

  const parsed = updateSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Eingabe ungültig',
    };
  }

  await db
    .insert(userSettings)
    .values({
      userId: user.id,
      trackWeight: parsed.data.trackWeight,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { trackWeight: parsed.data.trackWeight, updatedAt: new Date() },
    });

  // The weight field lives on the day screen, so that has to re-render too.
  revalidateSettings();

  return { ok: true };
}
