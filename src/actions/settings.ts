'use server';

import { requireUserForAction } from '@/auth.helpers';
import { db } from '@/db';
import { userSettings } from '@/db/schema';
import {
  revalidateAnalysisSettings,
  revalidateChrome,
  revalidateSettings,
} from '@/lib/revalidate';
import {
  updateMascotCharacterSchema,
  updateMascotFigureSchema,
  updateMascotSchema,
  updateSettingsSchema,
  updateTraceExposureSchema,
} from '@/lib/validation/settings';
import type { MascotCharacter } from '@/components/mascot/rive-asset';
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
 * Toggles the companion — the figure AND the sentences that go with it.
 *
 * `revalidateChrome` and not `revalidateSettings`: this used to be true of the
 * day and progress screens only, and it was written down that way. The figure
 * has since moved into `(app)/layout.tsx`, so the flag now changes what every
 * route in the group renders.
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

  revalidateChrome();

  return { ok: true };
}

/**
 * Toggles only the figure in the corner.
 *
 * Separate from `setShowMascot` because the two wishes are different: this one
 * keeps the reading of the day and takes away the drawing. It is what the
 * header button writes, so it is reachable from every screen — hence
 * `revalidateChrome` here too, and hence the list in `revalidate.ts`.
 */
export async function setShowMascotFigure(input: {
  showMascotFigure: boolean;
}): Promise<ActionResult> {
  const user = await requireUserForAction();

  const parsed = updateMascotFigureSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Eingabe ungültig',
    };
  }

  await db
    .insert(userSettings)
    .values({ userId: user.id, showMascotFigure: parsed.data.showMascotFigure })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        showMascotFigure: parsed.data.showMascotFigure,
        updatedAt: new Date(),
      },
    });

  revalidateChrome();

  return { ok: true };
}

/**
 * Which of the two figures stands there.
 *
 * `revalidateChrome` for the same reason as the two flags above: the figure is
 * rendered by `(app)/layout.tsx`, so the choice changes every route in the group
 * and not only the screen the chip was tapped on.
 */
export async function setMascotCharacter(input: {
  mascotCharacter: MascotCharacter;
}): Promise<ActionResult> {
  const user = await requireUserForAction();

  const parsed = updateMascotCharacterSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Eingabe ungültig',
    };
  }

  await db
    .insert(userSettings)
    .values({ userId: user.id, mascotCharacter: parsed.data.mascotCharacter })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        mascotCharacter: parsed.data.mascotCharacter,
        updatedAt: new Date(),
      },
    });

  revalidateChrome();

  return { ok: true };
}
