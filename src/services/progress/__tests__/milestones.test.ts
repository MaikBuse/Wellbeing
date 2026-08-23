import { describe, expect, it } from 'vitest';
import { GLOBAL_GATES } from '@/services/analysis/gates';
import { addDays, type LogDate } from '@/lib/time';
import { dayCompleteness, emptyCoverage } from '../completeness';
import {
  evaluateMilestones,
  isAchieved,
  MILESTONE_KEYS,
  type Milestone,
  type MilestoneKey,
} from '../milestones';
import { computeStreak } from '../streak';
import type { DayCompleteness, DayDoses } from '../types';
import { counted, coverage, lastDay, START, withSlots } from './fixtures';

function streakFor(pattern: string) {
  return computeStreak(coverage(pattern), START, lastDay(pattern));
}

function fullDay(logDate: LogDate): DayCompleteness {
  return dayCompleteness(
    withSlots(counted(logDate), ['breakfast', 'lunch', 'dinner']),
    { due: 1, answered: 1 }
  );
}

function emptyDay(logDate: LogDate): DayCompleteness {
  return dayCompleteness(emptyCoverage(logDate), { due: 0, answered: 0 });
}

function evaluate(options: {
  pattern: string;
  completeness?: DayCompleteness[];
  doses?: Map<LogDate, DayDoses>;
  raIndexDays?: LogDate[];
}) {
  return evaluateMilestones({
    streak: streakFor(options.pattern),
    completeness: options.completeness ?? [],
    doses: options.doses ?? new Map(),
    raIndexDays: options.raIndexDays ?? [],
  });
}

function find(milestones: Milestone[], key: MilestoneKey): Milestone {
  const found = milestones.find((milestone) => milestone.key === key);
  if (!found) throw new Error(`no milestone ${key}`);
  return found;
}

describe('the catalogue', () => {
  it('stays small enough to mean something', () => {
    expect(MILESTONE_KEYS).toHaveLength(8);
  });

  it('produces exactly one entry per key', () => {
    const milestones = evaluate({ pattern: 'x' });
    expect(milestones.map((milestone) => milestone.key)).toEqual([
      ...MILESTONE_KEYS,
    ]);
  });

  it('never names a food, symptom or weight', () => {
    // Health-data hygiene: these strings end up in a toast and a badge.
    const forbidden = /gramm|kilo|kg|gluten|laktose|schmerz|symptom/i;
    for (const milestone of evaluate({ pattern: 'x' })) {
      expect(milestone.title).not.toMatch(forbidden);
      expect(milestone.description).not.toMatch(forbidden);
    }
  });
});

describe('streak milestones', () => {
  it('stays open below the threshold', () => {
    const milestone = find(evaluate({ pattern: 'x'.repeat(6) }), 'streak_7');
    expect(isAchieved(milestone)).toBe(false);
    expect(milestone.have).toBe(6);
    expect(milestone.need).toBe(7);
  });

  it('records the day the run first reached seven', () => {
    const milestone = find(evaluate({ pattern: 'x'.repeat(10) }), 'streak_7');
    expect(milestone.achievedOn).toBe(addDays(START, 6));
  });

  it('keeps the date of the FIRST time, not the latest run', () => {
    // 8 counted, a broken gap, then 8 more. The badge belongs to the first one.
    const pattern = 'x'.repeat(8) + '..' + 'x'.repeat(8);
    const milestone = find(evaluate({ pattern }), 'streak_7');
    expect(milestone.achievedOn).toBe(addDays(START, 6));
  });

  it('counts a protection day towards the badge, as the flame does', () => {
    // Anything else would print a different number on the badge than on the
    // flame for the same run.
    const pattern = 'x'.repeat(7) + '.' + 'xx';
    const milestone = find(evaluate({ pattern }), 'streak_30');
    expect(milestone.have).toBe(10);
  });

  it('leaves the long ones open on a short history', () => {
    const milestones = evaluate({ pattern: 'x'.repeat(10) });
    expect(isAchieved(find(milestones, 'streak_30'))).toBe(false);
    expect(isAchieved(find(milestones, 'streak_100'))).toBe(false);
    expect(isAchieved(find(milestones, 'streak_365'))).toBe(false);
  });
});

describe('the two gate milestones mirror the analysis', () => {
  it('uses GLOBAL_GATES.trackedDays verbatim', () => {
    const milestone = find(evaluate({ pattern: 'x' }), 'tracked_60');
    expect(milestone.need).toBe(GLOBAL_GATES.trackedDays);
  });

  it('uses GLOBAL_GATES.daysWithRaIndex verbatim', () => {
    const milestone = find(evaluate({ pattern: 'x' }), 'ra_index_45');
    expect(milestone.need).toBe(GLOBAL_GATES.daysWithRaIndex);
  });

  it('counts recorded days, not calendar days', () => {
    // Protection days carry the streak but produce no data, so they must NOT
    // move this one — it is the analysis's own case count.
    const pattern = 'x'.repeat(7) + '.' + 'x'.repeat(7);
    const milestone = find(evaluate({ pattern }), 'tracked_60');
    expect(milestone.have).toBe(14);
  });

  it('falls on the sixtieth recorded day', () => {
    const pattern = 'x'.repeat(GLOBAL_GATES.trackedDays + 5);
    const milestone = find(evaluate({ pattern }), 'tracked_60');
    expect(milestone.achievedOn).toBe(
      addDays(START, GLOBAL_GATES.trackedDays - 1)
    );
  });

  it('falls on the forty-fifth day with an RA day value', () => {
    const raIndexDays = Array.from(
      { length: GLOBAL_GATES.daysWithRaIndex + 3 },
      (_, index) => addDays(START, index)
    );
    const milestone = find(
      evaluate({ pattern: 'x', raIndexDays }),
      'ra_index_45'
    );
    expect(milestone.achievedOn).toBe(
      addDays(START, GLOBAL_GATES.daysWithRaIndex - 1)
    );
  });
});

describe('complete_week', () => {
  it('needs seven complete days in a row', () => {
    const days = Array.from({ length: 6 }, (_, i) => fullDay(addDays(START, i)));
    const milestone = find(
      evaluate({ pattern: 'x'.repeat(6), completeness: days }),
      'complete_week'
    );
    expect(isAchieved(milestone)).toBe(false);
    expect(milestone.have).toBe(6);
  });

  it('is reached on the seventh consecutive complete day', () => {
    const days = Array.from({ length: 9 }, (_, i) => fullDay(addDays(START, i)));
    const milestone = find(
      evaluate({ pattern: 'x'.repeat(9), completeness: days }),
      'complete_week'
    );
    expect(milestone.achievedOn).toBe(addDays(START, 6));
  });

  it('is broken by one thin day in the middle', () => {
    const days = Array.from({ length: 9 }, (_, i) =>
      i === 4 ? emptyDay(addDays(START, i)) : fullDay(addDays(START, i))
    );
    const milestone = find(
      evaluate({ pattern: 'x'.repeat(9), completeness: days }),
      'complete_week'
    );
    expect(isAchieved(milestone)).toBe(false);
    expect(milestone.have).toBe(4);
  });
});

describe('meds_30', () => {
  function withDoses(entries: (DayDoses | null)[]) {
    const completeness: DayCompleteness[] = [];
    const doses = new Map<LogDate, DayDoses>();
    entries.forEach((entry, index) => {
      const logDate = addDays(START, index);
      completeness.push(fullDay(logDate));
      doses.set(logDate, entry ?? { due: 0, answered: 0 });
    });
    return { completeness, doses };
  }

  it('does not apply when nothing was ever due', () => {
    const { completeness, doses } = withDoses(Array(40).fill(null));
    const milestone = find(
      evaluate({ pattern: 'x'.repeat(40), completeness, doses }),
      'meds_30'
    );
    expect(milestone.applicable).toBe(false);
  });

  it('treats a day with nothing due as neutral, not as a gap', () => {
    // A fortnightly biologic has genuinely empty days. Letting those reset the
    // counter would make the badge unreachable for exactly those schedules.
    const entries: (DayDoses | null)[] = Array.from({ length: 60 }, (_, i) =>
      i % 2 === 0 ? { due: 1, answered: 1 } : null
    );
    const { completeness, doses } = withDoses(entries);
    const milestone = find(
      evaluate({ pattern: 'x'.repeat(60), completeness, doses }),
      'meds_30'
    );
    expect(milestone.applicable).toBe(true);
    expect(milestone.have).toBe(30);
    expect(isAchieved(milestone)).toBe(true);
  });

  it('breaks on a day where a due dose went unanswered', () => {
    const entries: (DayDoses | null)[] = Array.from({ length: 40 }, (_, i) =>
      i === 20 ? { due: 2, answered: 1 } : { due: 2, answered: 2 }
    );
    const { completeness, doses } = withDoses(entries);
    const milestone = find(
      evaluate({ pattern: 'x'.repeat(40), completeness, doses }),
      'meds_30'
    );
    expect(milestone.have).toBe(20);
    expect(isAchieved(milestone)).toBe(false);
  });

  it('counts a deliberate skip as answered', () => {
    // Recorded in the loader: taken OR skipped. A decision is data; only an
    // untouched dose is a hole.
    const { completeness, doses } = withDoses(
      Array(30).fill({ due: 1, answered: 1 })
    );
    const milestone = find(
      evaluate({ pattern: 'x'.repeat(30), completeness, doses }),
      'meds_30'
    );
    expect(isAchieved(milestone)).toBe(true);
  });
});
