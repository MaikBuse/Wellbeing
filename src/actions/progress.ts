'use server';

import { requireUserWithSettings } from '@/auth.helpers';
import { db } from '@/db';
import { achievements } from '@/db/schema';
import { revalidateProgress } from '@/lib/revalidate';
import { todayLogDate } from '@/lib/time';
import { acknowledgeAchievementSchema } from '@/lib/validation/progress';
import { loadProgress } from '@/services/progress/loader';
import type { ActionResult } from './meals';

/**
 * Marks a milestone's one-time celebration as seen.
 *
 * The date is re-derived server-side rather than taken from the request: the
 * client knows which badge it is looking at, but "when was this reached" is a
 * statement about the data and belongs to the server. `onConflictDoNothing`
 * makes a double tap — or a second tab — a no-op instead of an error.
 *
 * Refuses a milestone that has not actually been reached, so a hand-crafted
 * POST cannot write a badge into the grid.
 */
export async function acknowledgeAchievement(input: {
  key: string;
}): Promise<ActionResult> {
  const { user, settings } = await requireUserWithSettings();

  const parsed = acknowledgeAchievementSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Eingabe ungültig',
    };
  }

  const today = todayLogDate(settings.timeZone, settings.dayStartHour);
  const progress = await loadProgress(user.id, today);
  const milestone = progress.milestones.find(
    (entry) => entry.key === parsed.data.key
  );

  if (!milestone || !milestone.applicable || milestone.achievedOn === null) {
    return { ok: false, error: 'Meilenstein noch nicht erreicht' };
  }

  await db
    .insert(achievements)
    .values({
      userId: user.id,
      key: milestone.key,
      achievedOn: milestone.achievedOn,
    })
    .onConflictDoNothing();

  revalidateProgress();

  return { ok: true };
}

/** Kept for symmetry with the other action modules. */
export type { ActionResult };
