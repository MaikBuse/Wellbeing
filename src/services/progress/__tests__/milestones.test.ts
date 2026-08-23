import { describe, expect, it } from 'vitest';
import { GLOBAL_GATES } from '@/services/analysis/gates';
import { addDays, type LogDate } from '@/lib/time';
import { dayCompleteness, emptyCoverage } from '../completeness';
import {
  NO_NUTRITION,
  NUTRITION_GOOD_DAYS_NEEDED,
  NUTRITION_READY_DAYS,
  evaluateMilestones,
  isAchieved,
  MILESTONE_KEYS,
  type Milestone,
  type MilestoneKey,
  type NutritionMilestoneInput,
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
  nutrition?: NutritionMilestoneInput;
}) {
  return evaluateMilestones({
    streak: streakFor(options.pattern),
    completeness: options.completeness ?? [],
    doses: options.doses ?? new Map(),
    raIndexDays: options.raIndexDays ?? [],
    nutrition: options.nutrition ?? NO_NUTRITION,
  });
}

function nutritionDays(count: number): LogDate[] {
  return Array.from({ length: count }, (_, index) => addDays(START, index));
}

/** Every milestone text, with the nutrient pair active so it is included. */
function allMilestones(): Milestone[] {
  return evaluate({
    pattern: 'x',
    nutrition: {
      active: true,
      assessableDays: nutritionDays(NUTRITION_READY_DAYS),
      goodDays: nutritionDays(NUTRITION_GOOD_DAYS_NEEDED),
    },
  });
}

function find(milestones: Milestone[], key: MilestoneKey): Milestone {
  const found = milestones.find((milestone) => milestone.key === key);
  if (!found) throw new Error(`no milestone ${key}`);
  return found;
}

describe('the catalogue', () => {
  /*
   * Ten, and the number is asserted on purpose: adding a badge should be a
   * deliberate act that edits this line, not something that slips in.
   */
  it('stays small enough to mean something', () => {
    expect(MILESTONE_KEYS).toHaveLength(10);
  });

  it('produces exactly one entry per key', () => {
    const milestones = evaluate({ pattern: 'x' });
    expect(milestones.map((milestone) => milestone.key)).toEqual([
      ...MILESTONE_KEYS,
    ]);
  });

  /*
   * Health-data hygiene: these strings end up in a toast and a badge.
   *
   * Note the trap the nutrient milestones walk into: `gramm` also matches
   * "Programm" and "Diagramm", so any copy about the nutrient overview has to
   * say "Verlauf" or "Übersicht". That is a feature of the guard, not a bug in
   * it — the two words are one keystroke from a real leak.
   */
  const FORBIDDEN =
    /gramm|kilo|\bkg\b|gluten|laktose|schmerz|symptom|diagnos|arthritis|gewicht|bmi|abnehm|di[äa]t/i;
  /** No nutrient amount either: "1200 mg" on a badge is a health detail. */
  const FORBIDDEN_AMOUNT = /\d+\s*(g|mg|µg|kcal)\b/i;

  it('never names a food, symptom, weight or diagnosis', () => {
    for (const milestone of allMilestones()) {
      expect(milestone.title, milestone.key).not.toMatch(FORBIDDEN);
      expect(milestone.description, milestone.key).not.toMatch(FORBIDDEN);
    }
  });

  it('never prints a nutrient amount', () => {
    for (const milestone of allMilestones()) {
      expect(milestone.title, milestone.key).not.toMatch(FORBIDDEN_AMOUNT);
      expect(milestone.description, milestone.key).not.toMatch(FORBIDDEN_AMOUNT);
    }
  });

  /*
   * The guard checking itself, the way forbiddenWord.test.ts does. Without this
   * a rename could turn the regex into something that matches nothing and the
   * two tests above would keep passing while protecting nothing.
   */
  it('has a guard that would actually catch a violation', () => {
    expect('Zwei Kilo abgenommen').toMatch(FORBIDDEN);
    expect('Ein Diagramm der Woche').toMatch(FORBIDDEN);
    expect('1200 mg erreicht').toMatch(FORBIDDEN_AMOUNT);
    expect('Sieben Tage hintereinander erfasst.').not.toMatch(FORBIDDEN);
    expect('Sieben Tage hintereinander erfasst.').not.toMatch(FORBIDDEN_AMOUNT);
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


describe('die Nährstoff-Meilensteine', () => {
  it('are inapplicable until the questionnaire has been started', () => {
    const milestones = evaluate({ pattern: 'x' });
    expect(find(milestones, 'nutrition_ready').applicable).toBe(false);
    expect(find(milestones, 'nutrition_20').applicable).toBe(false);
  });

  it('reports how far along the data milestone is', () => {
    const milestones = evaluate({
      pattern: 'x',
      nutrition: {
        active: true,
        assessableDays: nutritionDays(12),
        goodDays: [],
      },
    });
    const ready = find(milestones, 'nutrition_ready');
    expect(ready.applicable).toBe(true);
    expect(ready.have).toBe(12);
    expect(ready.need).toBe(NUTRITION_READY_DAYS);
    expect(isAchieved(ready)).toBe(false);
  });

  it('marks the data milestone on the thirtieth defensible day', () => {
    const days = nutritionDays(NUTRITION_READY_DAYS + 5);
    const ready = find(
      evaluate({
        pattern: 'x',
        nutrition: { active: true, assessableDays: days, goodDays: [] },
      }),
      'nutrition_ready'
    );
    expect(ready.achievedOn).toBe(days[NUTRITION_READY_DAYS - 1]);
  });

  /*
   * Counted singly, not as a run. Twenty scattered good days earn it; a run
   * would let one poor day erase a fortnight of them, on exactly the axis where
   * that is least fair.
   */
  it('counts twenty good days even when they are not consecutive', () => {
    const scattered = Array.from({ length: NUTRITION_GOOD_DAYS_NEEDED }, (_, i) =>
      addDays(START, i * 3)
    );
    const milestone = find(
      evaluate({
        pattern: 'x',
        nutrition: {
          active: true,
          assessableDays: nutritionDays(NUTRITION_READY_DAYS),
          goodDays: scattered,
        },
      }),
      'nutrition_20'
    );
    expect(isAchieved(milestone)).toBe(true);
    // The date of the twentieth, not of the latest.
    expect(milestone.achievedOn).toBe(scattered[NUTRITION_GOOD_DAYS_NEEDED - 1]);
  });

  it('stays open one day short', () => {
    const milestone = find(
      evaluate({
        pattern: 'x',
        nutrition: {
          active: true,
          assessableDays: nutritionDays(NUTRITION_READY_DAYS),
          goodDays: nutritionDays(NUTRITION_GOOD_DAYS_NEEDED - 1),
        },
      }),
      'nutrition_20'
    );
    expect(isAchieved(milestone)).toBe(false);
  });
});
