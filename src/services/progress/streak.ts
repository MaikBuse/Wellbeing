/**
 * The streak — how many logical days in a row were actually recorded.
 *
 * Two decisions carry this file.
 *
 * FIRST, what counts. A day extends the streak under exactly the rule the
 * analysis already uses to decide a day is observed — `TRACKED_DAY_RULE` in
 * `services/analysis/facts.ts`. So a day that earns a flame is precisely a day
 * the analysis can use, and the feature cannot reward busywork the statistics
 * then throw away. `streakRuleMatchesAnalysis` in the tests holds the two
 * spellings together.
 *
 * That rule is also deliberately cheap to satisfy: one meal plus the flare
 * toggle is enough. A streak that snaps on a flare day would punish exactly the
 * days this app exists to capture — the same reasoning that left the daily
 * check without a submit button.
 *
 * SECOND, jokers. A missed day is bridged by a protection day if one is in
 * stock. Nothing about that is persisted: the walk is a pure function over the
 * dense calendar, so it is reproducible, testable, and it heals by itself when
 * a day is filled in later. Persisting consumption would be the only way to
 * stop back-filling from repairing the chain, and it would buy that by letting
 * the display drift away from the data. This way round is the honest one.
 */
import { eachLogDate, type LogDate } from '@/lib/time';
import type { DayCoverage, StreakDay, StreakResult } from './types';

/** Counted days needed to earn one protection day. */
export const JOKER_EARN_EVERY = 7;

/** Protection days never stockpile beyond this. */
export const JOKER_MAX = 3;

/**
 * The rule, spelled out so a test can compare it to the analysis's own.
 * Keep the wording byte-identical to `TRACKED_DAY_RULE`.
 */
export const STREAK_COUNTS = 'hasMeal && (hasDailyLog || hasSymptom)';

/** Does this day count towards the streak? */
export function dayCounts(day: DayCoverage | undefined): boolean {
  if (!day) return false;
  const hasMeal = day.slots.length > 0;
  return hasMeal && (day.hasDailyLog || day.hasSymptom);
}

/**
 * Walk the calendar from `from` to `to`, oldest first.
 *
 * `to` is the current logical day and is treated gently: a day still in
 * progress must not break the streak, because at 09:00 nothing has been
 * recorded yet and the flame would read zero every single morning. It simply
 * does not extend the run until it counts.
 */
export function computeStreak(
  coverage: readonly DayCoverage[],
  from: LogDate,
  to: LogDate
): StreakResult {
  const byDate = new Map(coverage.map((day) => [day.logDate, day]));
  const calendar = eachLogDate(from, to);

  let current = 0;
  let longest = 0;
  let countedDays = 0;
  let jokers = 0;
  let sinceLastJoker = 0;
  const days: StreakDay[] = [];

  for (const logDate of calendar) {
    const isToday = logDate === to;

    if (dayCounts(byDate.get(logDate))) {
      current++;
      countedDays++;
      sinceLastJoker++;
      if (sinceLastJoker >= JOKER_EARN_EVERY) {
        sinceLastJoker = 0;
        jokers = Math.min(JOKER_MAX, jokers + 1);
      }
      longest = Math.max(longest, current);
      days.push({ logDate, state: 'counted' });
      continue;
    }

    if (isToday) {
      // Today is unfinished, not missed. It neither extends nor breaks the run,
      // and it must not burn a joker that the evening might still redeem.
      days.push({ logDate, state: 'future' });
      continue;
    }

    if (current > 0 && jokers > 0) {
      jokers--;
      current++;
      longest = Math.max(longest, current);
      days.push({ logDate, state: 'joker' });
      continue;
    }

    current = 0;
    sinceLastJoker = 0;
    days.push({ logDate, state: 'missed' });
  }

  return { current, longest, jokersAvailable: jokers, countedDays, days };
}

/** The last `count` days of the walk, oldest first. For the day-dot row. */
export function tailDays(result: StreakResult, count: number): StreakDay[] {
  return result.days.slice(-count);
}

/**
 * The longest run of consecutive days satisfying `predicate`, ending on or
 * before the last entry. Used by the medication and completeness milestones,
 * which ask about runs rather than totals.
 */
export function longestRun<T>(
  items: readonly T[],
  predicate: (item: T) => boolean
): number {
  let best = 0;
  let run = 0;
  for (const item of items) {
    if (predicate(item)) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}
