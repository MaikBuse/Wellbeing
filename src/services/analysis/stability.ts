/**
 * "Has been near the top for N weeks."
 *
 * This carries more weight than it looks like it should. Recomputing is
 * on-demand and unthrottled, so nothing stops a person from running the
 * analysis ten times in an afternoon and treating whatever floats up as news.
 * `analysis_run`'s own doc calls reacting to a freshly-refreshed top result
 * "textbook overfitting", and with no cooldown this indicator is the remaining
 * defence against exactly that behaviour.
 *
 * Which is why the unit is the ISO WEEK, not the run: runs are bucketed by week
 * and only the last run of each week counts. Ten runs on one afternoon
 * therefore say precisely as much as one.
 */
import { isoWeekKey, toLogDate, type LogDate } from '@/lib/time';
import type { FindingStatus } from './types';

export const TOP_RANK = 5;
export type RankByKey = ReadonlyMap<string, number | null>;

export type PriorRun = {
  computedAt: Date;
  algorithmVersion: number;
  ranks: RankByKey;
};

export type StabilityEntry = {
  weeksInTopFive: number;
  previousRank: number | null;
};

export type StabilityInput = {
  algorithmVersion: number;
  timeZone: string;
  dayStartHour: number;
  /** When the run being scored was computed. Explicit, never inferred. */
  currentComputedAt: Date;
  current: readonly {
    key: string;
    rank: number | null;
    status: FindingStatus;
  }[];
  /** STRICTLY earlier runs. The current run must not appear here. */
  priorRuns: readonly PriorRun[];
};

/**
 * Walk back week by week from the current run.
 *
 * The chain breaks on a skipped week — "three weeks" must mean three
 * consecutive weeks, not three runs scattered over four months — and on an
 * `algorithmVersion` change, because a claim of stability must not span a
 * change in the definition of what it is stable at.
 */
export function computeStability(
  input: StabilityInput
): Map<string, StabilityEntry> {
  const out = new Map<string, StabilityEntry>();

  const currentWeek = isoWeekKey(
    toLogDate(input.currentComputedAt, input.timeZone, input.dayStartHour)
  );

  const weeks = bucketByWeek(input.priorRuns, input.timeZone, input.dayStartHour);
  // A run from earlier in the CURRENT week is not a previous week's evidence:
  // it is the same week, so it cannot extend the streak.
  weeks.delete(currentWeek);
  const orderedWeeks = [...weeks.keys()].sort().reverse();

  const previous = orderedWeeks.length > 0 ? weeks.get(orderedWeeks[0]) : undefined;

  for (const entry of input.current) {
    // Confirmatory only. A provisional factor has no rank, and letting one
    // earn "top five for three weeks" is exactly what this indicator exists to
    // prevent.
    const inTopNow = entry.status === 'confirmatory' && isTop(entry.rank);
    let streak = inTopNow ? 1 : 0;

    if (inTopNow) {
      let expectedWeek = previousWeekKey(currentWeek);
      for (const week of orderedWeeks) {
        if (week !== expectedWeek) break;
        const run = weeks.get(week);
        if (!run) break;
        if (run.algorithmVersion !== input.algorithmVersion) break;
        if (!isTop(run.ranks.get(entry.key) ?? null)) break;
        streak++;
        expectedWeek = previousWeekKey(week);
      }
    }

    out.set(entry.key, {
      weeksInTopFive: streak,
      previousRank: previous?.ranks.get(entry.key) ?? null,
    });
  }

  return out;
}

function isTop(rank: number | null | undefined): boolean {
  return rank !== null && rank !== undefined && rank <= TOP_RANK;
}

function bucketByWeek(
  runs: readonly PriorRun[],
  timeZone: string,
  dayStartHour: number
): Map<string, PriorRun> {
  const out = new Map<string, PriorRun>();
  for (const run of runs) {
    const week = isoWeekKey(toLogDate(run.computedAt, timeZone, dayStartHour));
    const existing = out.get(week);
    // Last run of the week wins: it is the one she actually looked at.
    if (!existing || run.computedAt > existing.computedAt) out.set(week, run);
  }
  return out;
}

/** Previous ISO week key, by stepping back seven days from its Thursday. */
export function previousWeekKey(weekKey: string): string {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!match) return weekKey;
  const isoYear = Number(match[1]);
  const week = Number(match[2]);
  const thursday = thursdayOfIsoWeek(isoYear, week);
  thursday.setUTCDate(thursday.getUTCDate() - 7);
  return isoWeekKey(formatUtc(thursday));
}

function thursdayOfIsoWeek(isoYear: number, week: number): Date {
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const offset = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - offset + 3);
  firstThursday.setUTCDate(firstThursday.getUTCDate() + (week - 1) * 7);
  return firstThursday;
}

function formatUtc(date: Date): LogDate {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
