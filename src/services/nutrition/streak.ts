import { eachLogDate, type LogDate } from '@/lib/time';
import { NUTRITION_GOOD_DAY, isGoodDay } from './score';
import type { NutritionDay } from './types';

/**
 * The second run — days in the target range, separate from the recording run.
 *
 * It is a SECOND run and not a fifth completeness block, because the two answer
 * different questions. The recording run and the completeness ring ask "did she
 * write it down", which is fully within her control on any day, flare or not.
 * This asks "how did the day look", which is not. Folding an outcome into the
 * behaviour score would mean a day with patchy records looks exactly like a day
 * with a poor diet, and neither reading would be true.
 *
 * Four things keep it from becoming the kind of run a fitness app has:
 *
 *  1. A FLARE DAY IS NEUTRAL. `daily_log.is_flare` takes the day out of the
 *     numerator and the denominator both. It does not break the run, does not
 *     spend a protection day, and does not count as a hit either. That is
 *     exactly what `medicationRun` does with a day on which no dose was due —
 *     not applicable is not the same as not done. The alternative would tell
 *     someone in a flare that the flare was a dietary failure.
 *  2. AN UNRELIABLE DAY IS NEUTRAL TOO. A day the data cannot speak for is the
 *     same state: neither rewarded nor punished.
 *  3. TODAY NEVER BREAKS IT, like `computeStreak` — nothing has been eaten yet
 *     at nine in the morning.
 *  4. NOTHING IS PERSISTED. The walk is a pure function over the dense
 *     calendar, so back-filling a day repairs the chain instead of leaving it
 *     broken, and the display can never drift from the data.
 *
 * The number shown more prominently than this run is the stateless quotient in
 * `nutritionWindow`: "on 9 of 12 defensible days in range". It has nothing to
 * lose, heals when a day is filled in, and can only go up.
 */

/** The rule, spelled out so a test can pin it. */
export const NUTRITION_STREAK_COUNTS = `score !== null && score >= ${NUTRITION_GOOD_DAY}`;

/** Good days needed to earn one protection day. */
export const NUTRITION_JOKER_EARN_EVERY = 7;
/** Protection days never stockpile beyond this. */
export const NUTRITION_JOKER_MAX = 3;

export type NutritionStreakState =
  | 'counted'
  | 'joker'
  | 'missed'
  /** Flare or not defensible — out of both sides of the ratio. */
  | 'neutral'
  | 'future';

export type NutritionStreakDay = { logDate: LogDate; state: NutritionStreakState };

export type NutritionStreakResult = {
  current: number;
  longest: number;
  jokersAvailable: number;
  goodDays: number;
  /** Days that were neither hit nor miss. Shown, so the run stays explicable. */
  neutralDays: number;
  days: NutritionStreakDay[];
};

export const EMPTY_NUTRITION_STREAK: NutritionStreakResult = {
  current: 0,
  longest: 0,
  jokersAvailable: 0,
  goodDays: 0,
  neutralDays: 0,
  days: [],
};

/** A day that is neither a hit nor a miss: it is simply not counted. */
export function isNeutral(day: NutritionDay | undefined): boolean {
  if (!day) return true;
  return day.isFlare || day.score === null;
}

export function computeNutritionStreak(
  days: readonly NutritionDay[],
  from: LogDate,
  to: LogDate
): NutritionStreakResult {
  const byDate = new Map(days.map((day) => [day.logDate, day]));
  const calendar = eachLogDate(from, to);

  let current = 0;
  let longest = 0;
  let goodDays = 0;
  let neutralDays = 0;
  let jokers = 0;
  let sinceLastJoker = 0;
  const walk: NutritionStreakDay[] = [];

  for (const logDate of calendar) {
    const day = byDate.get(logDate);

    if (logDate === to) {
      // Unfinished, not missed. Nothing about the evening is decided yet.
      walk.push({ logDate, state: 'future' });
      continue;
    }

    if (isNeutral(day)) {
      // Neither side of the ratio. The run carries straight through without
      // spending anything, because there is nothing here to bridge.
      neutralDays++;
      walk.push({ logDate, state: 'neutral' });
      continue;
    }

    if (isGoodDay(day as NutritionDay)) {
      current++;
      goodDays++;
      sinceLastJoker++;
      if (sinceLastJoker >= NUTRITION_JOKER_EARN_EVERY) {
        sinceLastJoker = 0;
        jokers = Math.min(NUTRITION_JOKER_MAX, jokers + 1);
      }
      longest = Math.max(longest, current);
      walk.push({ logDate, state: 'counted' });
      continue;
    }

    if (current > 0 && jokers > 0) {
      jokers--;
      current++;
      longest = Math.max(longest, current);
      walk.push({ logDate, state: 'joker' });
      continue;
    }

    current = 0;
    sinceLastJoker = 0;
    walk.push({ logDate, state: 'missed' });
  }

  return {
    current,
    longest,
    jokersAvailable: jokers,
    goodDays,
    neutralDays,
    days: walk,
  };
}

/** The last `count` days of the walk, oldest first. */
export function tailNutritionDays(
  result: NutritionStreakResult,
  count: number
): NutritionStreakDay[] {
  return result.days.slice(-count);
}
