'use server';

import { requireUserForAction } from '@/auth.helpers';
import { db } from '@/db';
import { userSettings } from '@/db/schema';
import { revalidateAnalysisSettings, revalidateSettings } from '@/lib/revalidate';
import {
  updateMascotSchema,
  updateSettingsSchema,
  updateTraceExposureSchema,
} from '@/lib/validation/settings';
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

/**
 * Toggles whether 'trace' tag assignments count as exposure.
 *
 * `deriveTags` marks "traces of soy" from an OFF `off_trace` rule with
 * confidence `trace`, and two grams of soy lecithin is not a soy day. Which
 * side of that line she wants is a judgement, not a fact, so it is hers to set.
 *
 * Flipping it invalidates more than the settings screen: the flag is part of
 * `analysis_run.params`, so the stored ranking now answers a different question
 * and the analysis has to be recomputed before the numbers agree again.
 */
export async function setCountTraceExposure(input: {
  countTraceExposure: boolean;
}): Promise<ActionResult> {
  const user = await requireUserForAction();

  const parsed = updateTraceExposureSchema.safeParse(input);
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
      countTraceExposure: parsed.data.countTraceExposure,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        countTraceExposure: parsed.data.countTraceExposure,
        updatedAt: new Date(),
      },
    });

  revalidateAnalysisSettings();

  return { ok: true };
}

/**
 * Toggles the mascot.
 *
 * `revalidateSettings` and not something narrower: the figure appears on the day
 * screen and on the progress screen, and both are inside the DAY set.
 */
export async function setShowMascot(input: {
  showMascot: boolean;
}): Promise<ActionResult> {
  const user = await requireUserForAction();

  const parsed = updateMascotSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Eingabe ungültig',
    };
  }

  await db
    .insert(userSettings)
    .values({ userId: user.id, showMascot: parsed.data.showMascot })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { showMascot: parsed.data.showMascot, updatedAt: new Date() },
    });

  revalidateSettings();

  return { ok: true };
}
