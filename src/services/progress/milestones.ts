/**
 * Milestones.
 *
 * Eight, and no more. A wall of collectibles would turn a health diary into a
 * slot machine, and every extra badge dilutes the two that carry real meaning:
 * `tracked_60` and `ra_index_45` are the app's own case-count gates
 * (`GLOBAL_GATES`), imported rather than copied. Reaching them is the moment
 * the analysis is allowed to speak — the only reward in here that changes what
 * the software can do.
 *
 * Everything is derived. `achievement` rows only record that a milestone's
 * one-time celebration has been dismissed.
 */
import { GLOBAL_GATES } from '@/services/analysis/gates';
import type { LogDate } from '@/lib/time';
import { COMPLETE_DAY_THRESHOLD } from './completeness';
import type { DayCompleteness, DayDoses, StreakResult } from './types';

export const MILESTONE_KEYS = [
  'streak_7',
  'streak_30',
  'streak_100',
  'streak_365',
  'complete_week',
  'meds_30',
  'tracked_60',
  'ra_index_45',
] as const;

export type MilestoneKey = (typeof MILESTONE_KEYS)[number];

export type Milestone = {
  key: MilestoneKey;
  title: string;
  /** What it took, in plain German. Never mentions foods or symptoms. */
  description: string;
  have: number;
  need: number;
  unit: string;
  /** The day it was first reached, or null while still open. */
  achievedOn: LogDate | null;
  /** False when the milestone cannot apply — hidden rather than shown at 0. */
  applicable: boolean;
};

export const MEDS_RUN_NEEDED = 30;
export const COMPLETE_WEEK_DAYS = 7;

export type MilestoneInput = {
  streak: StreakResult;
  /** Oldest first, bounded window. */
  completeness: readonly DayCompleteness[];
  /** Keyed by log date, same bounded window as `completeness`. */
  doses: ReadonlyMap<LogDate, DayDoses>;
  /** Days with a computable RA day value, ascending. */
  raIndexDays: readonly LogDate[];
};

export function evaluateMilestones(input: MilestoneInput): Milestone[] {
  const { streak } = input;

  const runLengths = runLengthSeries(streak);
  const countedDates = streak.days
    .filter((day) => day.state === 'counted')
    .map((day) => day.logDate);

  const completeRun = consecutiveRun(
    input.completeness.map((day) => ({
      logDate: day.logDate,
      ok: day.score >= COMPLETE_DAY_THRESHOLD,
    }))
  );

  const medsRun = medicationRun(input.completeness, input.doses);

  const streakMilestone = (
    key: MilestoneKey,
    need: number,
    title: string,
    description: string
  ): Milestone => ({
    key,
    title,
    description,
    have: Math.max(streak.longest, streak.current),
    need,
    unit: 'Tage',
    achievedOn: nthReached(runLengths, need),
    applicable: true,
  });

  return [
    streakMilestone(
      'streak_7',
      7,
      'Eine Woche am Stück',
      'Sieben Tage hintereinander erfasst.'
    ),
    streakMilestone(
      'streak_30',
      30,
      'Ein Monat am Stück',
      'Dreißig Tage hintereinander erfasst.'
    ),
    streakMilestone(
      'streak_100',
      100,
      'Hundert Tage',
      'Hundert Tage hintereinander erfasst.'
    ),
    streakMilestone(
      'streak_365',
      365,
      'Ein ganzes Jahr',
      'Ein Jahr hintereinander erfasst.'
    ),
    {
      key: 'complete_week',
      title: 'Eine vollständige Woche',
      description: `Sieben Tage hintereinander mit mindestens ${COMPLETE_DAY_THRESHOLD} % Vollständigkeit.`,
      have: completeRun.best,
      need: COMPLETE_WEEK_DAYS,
      unit: 'Tage',
      achievedOn: completeRun.reachedOn(COMPLETE_WEEK_DAYS),
      applicable: true,
    },
    {
      key: 'meds_30',
      title: 'Medikamente lückenlos',
      description:
        'Dreißig fällige Tage hintereinander, an denen jede Dosis beantwortet wurde.',
      have: medsRun.best,
      need: MEDS_RUN_NEEDED,
      unit: 'Tage',
      achievedOn: medsRun.reachedOn(MEDS_RUN_NEEDED),
      applicable: medsRun.applicable,
    },
    {
      key: 'tracked_60',
      title: 'Genug Daten für die Auswertung',
      description: `${GLOBAL_GATES.trackedDays} erfasste Tage — ab hier darf die Analyse von gesicherten Ergebnissen sprechen.`,
      have: streak.countedDays,
      need: GLOBAL_GATES.trackedDays,
      unit: 'Tage',
      achievedOn: countedDates[GLOBAL_GATES.trackedDays - 1] ?? null,
      applicable: true,
    },
    {
      key: 'ra_index_45',
      title: 'RA-Tageswert steht',
      description: `An ${GLOBAL_GATES.daysWithRaIndex} Tagen konnte ein RA-Tageswert berechnet werden.`,
      have: input.raIndexDays.length,
      need: GLOBAL_GATES.daysWithRaIndex,
      unit: 'Tage',
      achievedOn: input.raIndexDays[GLOBAL_GATES.daysWithRaIndex - 1] ?? null,
      applicable: true,
    },
  ];
}

export function isAchieved(milestone: Milestone): boolean {
  return milestone.achievedOn !== null;
}

/**
 * The running streak length after each calendar day.
 *
 * Kept as a series rather than just the maximum so a milestone can name the day
 * it fell on. Joker days extend the run exactly as the streak itself does —
 * anything else would put a different number on the badge than on the flame.
 */
function runLengthSeries(
  streak: StreakResult
): { logDate: LogDate; run: number }[] {
  const series: { logDate: LogDate; run: number }[] = [];
  let run = 0;
  for (const day of streak.days) {
    if (day.state === 'counted' || day.state === 'joker') run++;
    else if (day.state === 'missed') run = 0;
    // 'future' — today, still unfinished. Carry the run, do not extend it.
    series.push({ logDate: day.logDate, run });
  }
  return series;
}

function nthReached(
  series: readonly { logDate: LogDate; run: number }[],
  need: number
): LogDate | null {
  for (const entry of series) {
    if (entry.run >= need) return entry.logDate;
  }
  return null;
}

function consecutiveRun(days: readonly { logDate: LogDate; ok: boolean }[]) {
  let run = 0;
  let best = 0;
  const reachedAt = new Map<number, LogDate>();
  for (const day of days) {
    run = day.ok ? run + 1 : 0;
    if (run > best) best = run;
    if (day.ok && !reachedAt.has(run)) reachedAt.set(run, day.logDate);
  }
  return {
    best,
    reachedOn: (need: number) => reachedAt.get(need) ?? null,
  };
}

/**
 * Consecutive days on which every due dose was answered.
 *
 * A day with nothing due is neutral: it neither counts nor breaks the run. A
 * biologic given fortnightly has genuinely empty days, and letting those reset
 * the counter would make the milestone unreachable for exactly the medication
 * schedules it matters most for. When nothing was ever due, the milestone does
 * not apply at all rather than sitting at zero forever.
 */
function medicationRun(
  completeness: readonly DayCompleteness[],
  doses: ReadonlyMap<LogDate, DayDoses>
) {
  let run = 0;
  let best = 0;
  let everDue = false;
  const reachedAt = new Map<number, LogDate>();

  for (const day of completeness) {
    const due = doses.get(day.logDate);
    if (!due || due.due === 0) continue;
    everDue = true;
    if (due.answered >= due.due) {
      run++;
      if (run > best) best = run;
      if (!reachedAt.has(run)) reachedAt.set(run, day.logDate);
    } else {
      run = 0;
    }
  }

  return {
    best,
    applicable: everDue,
    reachedOn: (need: number) => reachedAt.get(need) ?? null,
  };
}
