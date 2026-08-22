/**
 * Cycle day and phase, derived from `menstrual_event`.
 *
 * `daily.ts` is explicit that these are never stored: a hand-typed cycle day
 * rots within weeks. Stratifying by phase matters because RA symptoms fluctuate
 * with it, so this is a real confounder rather than a nicety.
 *
 * Honest limitation: until the logging UI has been in use for a few cycles this
 * will be mostly `unknown`, and it is gated like any other exposure.
 */
import { addDays, daysBetween, type LogDate } from '@/lib/time';
import { median } from '@/lib/stats/summary';
import type { CyclePhase } from './types';

export type MenstrualEvent = {
  eventDate: LogDate;
  kind: 'period_start' | 'period_end' | 'spotting';
};

export type CycleDay = {
  cycleDay: number | null;
  phase: CyclePhase;
};

/** Beyond this many days past a period start, the cycle is stale, not long. */
export const MAX_CYCLE_DAYS = 45;
const DEFAULT_CYCLE_LENGTH = 28;

/**
 * Median observed cycle length, or the population default when fewer than two
 * period starts are known.
 *
 * Only gaps that look like a cycle count: a `period_start` recorded twice in a
 * week is a correction or spotting mislabelled, and a gap of three months is a
 * logging break rather than a 90-day cycle. Letting either into the median
 * would move the perimenstrual window for every day in the range.
 */
export function medianCycleLength(events: readonly MenstrualEvent[]): number {
  const starts = events
    .filter((e) => e.kind === 'period_start')
    .map((e) => e.eventDate)
    .sort();
  const gaps: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    const gap = daysBetween(starts[i - 1], starts[i]);
    if (gap >= 18 && gap <= MAX_CYCLE_DAYS) gaps.push(gap);
  }
  return median(gaps) ?? DEFAULT_CYCLE_LENGTH;
}

/**
 * Cycle day and phase for every day in a dense range.
 *
 * `days` must be contiguous. `events` should be fetched from ~45 days before
 * the range start, otherwise the first weeks have no defined phase for no
 * better reason than the query window.
 *
 * Phases are coarse on purpose — three buckets over a self-reported start date
 * is as much resolution as this data supports. Ovulation is not observed at
 * all, so the follicular/luteal split is a nominal midpoint, and that is why
 * the tested confounder is `cycle_perimenstrual` rather than a phase contrast.
 */
export function deriveCyclePhases(
  events: readonly MenstrualEvent[],
  days: readonly LogDate[]
): CycleDay[] {
  const starts = events
    .filter((e) => e.kind === 'period_start')
    .map((e) => e.eventDate)
    .sort();
  const ends = new Set(
    events.filter((e) => e.kind === 'period_end').map((e) => e.eventDate)
  );
  const cycleLength = medianCycleLength(events);

  return days.map((day) => {
    const start = latestStartOnOrBefore(starts, day);
    if (start === null) return { cycleDay: null, phase: 'unknown' };

    const cycleDay = daysBetween(start, day) + 1;
    if (cycleDay > MAX_CYCLE_DAYS) return { cycleDay: null, phase: 'unknown' };

    return { cycleDay, phase: phaseFor(cycleDay, cycleLength, start, ends) };
  });
}

function latestStartOnOrBefore(
  starts: readonly LogDate[],
  day: LogDate
): LogDate | null {
  let found: LogDate | null = null;
  for (const start of starts) {
    if (daysBetween(start, day) >= 0) found = start;
    else break;
  }
  return found;
}

/**
 * A recorded `period_end` wins over the length heuristic: she knows when her
 * period stopped, and guessing five days when it was two would misfile three
 * days of every cycle.
 */
function phaseFor(
  cycleDay: number,
  cycleLength: number,
  start: LogDate,
  ends: ReadonlySet<LogDate>
): CyclePhase {
  let bleedingDays = 5;
  for (let offset = 0; offset < 12; offset++) {
    if (ends.has(addDays(start, offset))) {
      bleedingDays = offset + 1;
      break;
    }
  }
  if (cycleDay <= bleedingDays) return 'menstrual';
  return cycleDay <= Math.round(cycleLength / 2) ? 'follicular' : 'luteal';
}

/**
 * The tested confounder: the days around menstruation, where RA symptoms are
 * most reported to shift. One binary hypothesis, not a three-way phase
 * contrast, because three contrasts would be three hypotheses for one question.
 */
export function isPerimenstrual(
  cycle: CycleDay,
  cycleLength: number
): boolean | null {
  if (cycle.cycleDay === null) return null;
  return cycle.cycleDay <= 3 || cycle.cycleDay >= cycleLength - 3;
}
