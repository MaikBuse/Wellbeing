'use server';

import { requireUserForAction } from '@/auth.helpers';
import { runAnalysisForUser } from '@/services/analysis/loader';
import { revalidateAnalysis } from '@/lib/revalidate';
import type { ActionResult } from './meals';

/**
 * Recompute the ranking.
 *
 * On demand and unthrottled, by decision: `analysis_run`'s own doc warns that
 * reacting to a freshly-refreshed top result is textbook overfitting, and the
 * answer here is not a lock but the stability indicator — every run is stored,
 * and the UI says how many consecutive WEEKS a factor has stayed near the top.
 *
 * Health-data hygiene: this catches everything and returns a fixed German
 * sentence. Postgres error text can embed column values — a food name, a
 * weight — so `error.message` must never reach a log. There is no `console.log`
 * anywhere in the analysis path at all.
 */
export type RecomputeResult =
  | { ok: true; runId: string; durationMs: number }
  | { ok: false; error: string };

export async function recomputeSuspicionRanking(): Promise<RecomputeResult> {
  const user = await requireUserForAction();

  try {
    const { runId, durationMs } = await runAnalysisForUser(user.id);
    revalidateAnalysis();
    return { ok: true, runId, durationMs };
  } catch {
    return {
      ok: false,
      error: 'Die Auswertung konnte nicht berechnet werden. Bitte später erneut versuchen.',
    };
  }
}

/** Kept for symmetry with the other action modules. */
export type { ActionResult };
