import { describe, expect, it } from 'vitest';
import { TRACKED_DAY_RULE } from '@/services/analysis/facts';
import { addDays } from '@/lib/time';
import {
  computeStreak,
  dayCounts,
  JOKER_MAX,
  longestRun,
  STREAK_COUNTS,
  tailDays,
} from '../streak';
import { blank, counted, coverage, lastDay, START } from './fixtures';

/**
 * The rule the streak counts by must stay identical to the one the analysis
 * treats as an observed day. If the analysis ever changes its mind, this test
 * goes red rather than the app quietly rewarding days the statistics discard.
 */
describe('the streak rule and the analysis agree', () => {
  it('spells the rule the same way', () => {
    expect(STREAK_COUNTS).toBe(TRACKED_DAY_RULE);
  });

  it('needs a meal', () => {
    expect(
      dayCounts({
        logDate: START,
        slots: [],
        hasDailyLog: true,
        coreFilled: 5,
        hasWellbeing: true,
        hasSymptom: true,
      })
    ).toBe(false);
  });

  it('accepts a meal plus a symptom, with no daily log', () => {
    expect(
      dayCounts({
        logDate: START,
        slots: ['dinner'],
        hasDailyLog: false,
        coreFilled: 0,
        hasWellbeing: false,
        hasSymptom: true,
      })
    ).toBe(true);
  });

  it('accepts a bare flare toggle beside a meal', () => {
    // A daily_log row exists as soon as one field is autosaved, and the flare
    // toggle is one tap. That is the point: a flare day must stay reachable.
    expect(
      dayCounts({
        logDate: START,
        slots: ['lunch'],
        hasDailyLog: true,
        coreFilled: 0,
        hasWellbeing: false,
        hasSymptom: false,
      })
    ).toBe(true);
  });

  it('rejects a missing day', () => {
    expect(dayCounts(undefined)).toBe(false);
    expect(dayCounts(blank(START))).toBe(false);
  });
});

describe('computeStreak', () => {
  it('reports nothing for a single blank day', () => {
    const result = computeStreak([blank(START)], START, START);
    expect(result.current).toBe(0);
    expect(result.longest).toBe(0);
    expect(result.countedDays).toBe(0);
  });

  it('counts a single recorded day', () => {
    const result = computeStreak([counted(START)], START, START);
    expect(result.current).toBe(1);
    expect(result.countedDays).toBe(1);
    expect(result.days[0].state).toBe('counted');
  });

  it('does not let an unfinished today break the run', () => {
    // 'xxx' then today, still empty. At 09:00 nothing is recorded yet and the
    // flame must not read zero every single morning.
    const pattern = 'xxx.';
    const result = computeStreak(
      coverage(pattern),
      START,
      lastDay(pattern)
    );
    expect(result.current).toBe(3);
    expect(result.days[3].state).toBe('future');
  });

  it('breaks on a gap when no protection day is in stock', () => {
    const pattern = 'xxx.xx';
    const result = computeStreak(coverage(pattern), START, lastDay(pattern));
    expect(result.current).toBe(2);
    expect(result.longest).toBe(3);
    expect(result.countedDays).toBe(5);
    expect(result.days[3].state).toBe('missed');
  });

  it('spends a protection day earned by seven counted days', () => {
    const pattern = 'xxxxxxx.x';
    const result = computeStreak(coverage(pattern), START, lastDay(pattern));
    expect(result.days[7].state).toBe('joker');
    expect(result.current).toBe(9);
    // The joker day carried the run but produced no data.
    expect(result.countedDays).toBe(8);
    expect(result.jokersAvailable).toBe(0);
  });

  it('spends three protection days and then breaks', () => {
    // 21 counted days bank the full stock of three. Four gaps follow, and the
    // trailing day is deliberately one more gap: the LAST day of the walk is
    // "today", which is never judged, so the day under test must not be it.
    const pattern = 'x'.repeat(21) + '.....';
    const result = computeStreak(coverage(pattern), START, lastDay(pattern));
    expect(result.longest).toBe(24);
    expect(result.current).toBe(0);
    expect(result.days.slice(21, 24).map((day) => day.state)).toEqual([
      'joker',
      'joker',
      'joker',
    ]);
    expect(result.days[24].state).toBe('missed');
    expect(result.days[25].state).toBe('future');
  });

  it('never stockpiles more than the cap', () => {
    const pattern = 'x'.repeat(70);
    const result = computeStreak(coverage(pattern), START, lastDay(pattern));
    expect(result.jokersAvailable).toBe(JOKER_MAX);
  });

  it('stops bridging once the stock runs out mid-gap', () => {
    // 14 counted days bank two protection days. Six gaps follow: the first two
    // are carried, the rest are simply missed, and the run restarts from the
    // next recorded day.
    const pattern = 'x'.repeat(14) + '......' + 'xx';
    const result = computeStreak(coverage(pattern), START, lastDay(pattern));
    expect(result.days.slice(14, 20).map((day) => day.state)).toEqual([
      'joker',
      'joker',
      'missed',
      'missed',
      'missed',
      'missed',
    ]);
    expect(result.current).toBe(2);
    expect(result.longest).toBe(16);
  });

  it('never spends a protection day before any run exists', () => {
    // Leading blank days have no run to protect, and no stock to protect it
    // with. They must read as missed rather than quietly consuming anything.
    const pattern = '..xx';
    const result = computeStreak(coverage(pattern), START, lastDay(pattern));
    expect(result.days.map((day) => day.state)).toEqual([
      'missed',
      'missed',
      'counted',
      'counted',
    ]);
  });

  it('heals when a missed day is filled in later', () => {
    const pattern = 'xx.xx';
    const before = computeStreak(coverage(pattern), START, lastDay(pattern));
    expect(before.current).toBe(2);

    const repaired = coverage(pattern);
    repaired[2] = counted(repaired[2].logDate);
    const after = computeStreak(repaired, START, lastDay(pattern));
    expect(after.current).toBe(5);
  });

  it('walks across a spring DST change without losing a day', () => {
    // 2026-03-29 is a 23-hour day in Europe/Berlin. The walk is pure calendar
    // arithmetic, so it must not care — this is why nothing here adds 86400 s.
    const from = '2026-03-27';
    const result = computeStreak(coverage('xxxxx', from), from, addDays(from, 4));
    expect(result.current).toBe(5);
    expect(result.days.map((day) => day.logDate)).toEqual([
      '2026-03-27',
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
      '2026-03-31',
    ]);
  });

  it('walks across an autumn DST change without gaining one', () => {
    // 2026-10-25 is a 25-hour day.
    const from = '2026-10-23';
    const result = computeStreak(coverage('xxxxx', from), from, addDays(from, 4));
    expect(result.days).toHaveLength(5);
    expect(result.days[4].logDate).toBe('2026-10-27');
  });

  it('fills gaps the coverage array never mentions', () => {
    // The database returns rows, not days. A streak is the difference between
    // the two, so an absent row has to become a missed day.
    const result = computeStreak(
      [counted('2026-01-01'), counted('2026-01-05')],
      '2026-01-01',
      '2026-01-05'
    );
    expect(result.days).toHaveLength(5);
    expect(result.days.map((day) => day.state)).toEqual([
      'counted',
      'missed',
      'missed',
      'missed',
      'counted',
    ]);
  });
});

describe('tailDays', () => {
  it('returns the most recent days, oldest first', () => {
    const pattern = 'x'.repeat(10);
    const result = computeStreak(coverage(pattern), START, lastDay(pattern));
    const tail = tailDays(result, 7);
    expect(tail).toHaveLength(7);
    expect(tail[0].logDate).toBe(addDays(START, 3));
    expect(tail[6].logDate).toBe(addDays(START, 9));
  });

  it('copes with a history shorter than the window', () => {
    const result = computeStreak(coverage('xx'), START, lastDay('xx'));
    expect(tailDays(result, 7)).toHaveLength(2);
  });
});

describe('longestRun', () => {
  it('finds the longest consecutive run', () => {
    expect(longestRun([1, 1, 0, 1, 1, 1, 0], (n) => n === 1)).toBe(3);
  });

  it('is zero for an empty list', () => {
    expect(longestRun([], () => true)).toBe(0);
  });
});
