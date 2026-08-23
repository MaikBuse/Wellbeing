import { describe, expect, it } from 'vitest';
import type { NutrientKey } from '@/lib/nutrients';
import { addDays, type LogDate } from '@/lib/time';
import {
  EMPTY_NUTRITION_SUMMARY,
  MIN_EVALUABLE_DAYS,
  byIsoWeek,
  nutritionWindow,
  periodScoreboard,
  summarisePeriod,
  weeklyComparables,
} from '../period';
import {
  EMPTY_NUTRITION_STREAK,
  NUTRITION_JOKER_EARN_EVERY,
  NUTRITION_JOKER_MAX,
  computeNutritionStreak,
} from '../streak';
import { nutritionDay } from '../score';
import { NUTRITION_TEST_TARGETS, ON_TARGET } from './helpers';
import { dayWith, minTarget, total } from './fixtures';
import type { NutritionDay } from '../types';

const START: LogDate = '2026-08-01';

function perfect(logDate: LogDate, isFlare = false): NutritionDay {
  return nutritionDay(
    dayWith(
      {
        fiber: total(ON_TARGET.fiber),
        calcium: total(ON_TARGET.calcium),
        salt: total(ON_TARGET.salt),
        vitC: total(ON_TARGET.vitC),
        magnesium: total(ON_TARGET.magnesium),
      },
      { logDate }
    ),
    NUTRITION_TEST_TARGETS,
    { isFlare }
  );
}

function poor(logDate: LogDate, isFlare = false): NutritionDay {
  return nutritionDay(
    dayWith(
      {
        fiber: total(10),
        calcium: total(300),
        salt: total(14),
        vitC: total(20),
        magnesium: total(80),
      },
      { logDate }
    ),
    NUTRITION_TEST_TARGETS,
    { isFlare }
  );
}

/** Recorded, but only one main meal — the day cannot speak for itself. */
function unreliable(logDate: LogDate): NutritionDay {
  return nutritionDay(
    dayWith({ fiber: total(8) }, { logDate, mainSlots: 1 }),
    NUTRITION_TEST_TARGETS,
    { isFlare: false }
  );
}

describe('nutritionWindow', () => {
  it('is empty rather than zero without any days', () => {
    expect(nutritionWindow([])).toEqual(EMPTY_NUTRITION_SUMMARY);
    expect(nutritionWindow([]).ratio).toBeNull();
  });

  it('counts good days over assessable days, not over calendar days', () => {
    const days = [
      perfect('2026-08-01'),
      poor('2026-08-02'),
      unreliable('2026-08-03'),
      perfect('2026-08-04'),
    ];
    const summary = nutritionWindow(days);
    expect(summary.assessableDays).toBe(3);
    expect(summary.goodDays).toBe(2);
    expect(summary.ratio).toBeCloseTo(2 / 3, 10);
    expect(summary.unreliableDays).toBe(1);
  });

  /*
   * A flare day is out of the numerator AND the denominator. The ratio must be
   * identical whichever score that day would have had — that is what "neutral"
   * means, and it is why a flare cannot be read as a dietary failure.
   */
  it('excludes a flare day from both sides of the ratio', () => {
    const base = [perfect('2026-08-01'), perfect('2026-08-02'), poor('2026-08-03')];
    const withGoodFlare = nutritionWindow([...base, perfect('2026-08-04', true)]);
    const withBadFlare = nutritionWindow([...base, poor('2026-08-04', true)]);

    expect(withGoodFlare.ratio).toEqual(withBadFlare.ratio);
    expect(withGoodFlare.assessableDays).toBe(withBadFlare.assessableDays);
    expect(withGoodFlare.assessableDays).toBe(3);
    expect(withGoodFlare.flareDaysSkipped).toBe(1);
  });

  it('names the nutrients that fell short most often', () => {
    const days = [poor('2026-08-01'), poor('2026-08-02'), perfect('2026-08-03')];
    const weakest = nutritionWindow(days).weakest;
    expect(weakest.length).toBeGreaterThan(0);
    expect(weakest[0].days).toBe(2);
    // Every entry names a nutrient, never a food.
    for (const entry of weakest) expect(entry.labelDe).not.toMatch(/brot|milch/i);
  });

  it('ignores days it could not assess when tallying the weakest', () => {
    const days = [unreliable('2026-08-01'), unreliable('2026-08-02')];
    expect(nutritionWindow(days).weakest).toEqual([]);
  });
});

describe('summarisePeriod', () => {
  it('withholds an aggregate below the gate', () => {
    const days = [perfect('2026-08-01'), poor('2026-08-02')];
    const result = summarisePeriod('fiber', days, MIN_EVALUABLE_DAYS.week);
    expect(result.daysEvaluable).toBe(2);
    expect(result.shareInTarget).toBeNull();
  });

  /*
   * Under-documentation suppresses "short of the target" but not "already past
   * it": 40 g of fibre is 40 g whether or not lunch was written down.
   */
  it('still lets an under-documented day prove a minimum was reached', () => {
    const day = nutritionDay(
      dayWith({ fiber: total(40) }, { logDate: '2026-08-01', mainSlots: 1 }),
      NUTRITION_TEST_TARGETS,
      { isFlare: false }
    );
    const fibre = day.nutrients.find((entry) => entry.key === 'fiber');
    expect(day.score).toBeNull();
    expect(fibre?.status).toBe('met');
  });

  it('withholds a verdict on an under-documented day that fell short', () => {
    const fibre = unreliable('2026-08-01').nutrients.find(
      (entry) => entry.key === 'fiber'
    );
    expect(fibre?.status).toBe('unknown');
  });

  it('divides by evaluable days, not by days in range', () => {
    const days = [
      perfect('2026-08-01'),
      perfect('2026-08-02'),
      poor('2026-08-03'),
      unreliable('2026-08-04'),
      perfect('2026-08-05'),
    ];
    const result = summarisePeriod('fiber', days, MIN_EVALUABLE_DAYS.week);
    expect(result.daysInRange).toBe(5);
    expect(result.daysEvaluable).toBe(4);
    expect(result.daysInTarget).toBe(3);
    expect(result.shareInTarget).toBeCloseTo(0.75, 10);
  });

  /* Median, so one festive meal cannot move a month. */
  it('uses the median ratio rather than the mean', () => {
    const days = [
      perfect('2026-08-01'),
      perfect('2026-08-02'),
      perfect('2026-08-03'),
      nutritionDay(
        dayWith(
          {
            fiber: total(300),
            calcium: total(ON_TARGET.calcium),
            salt: total(ON_TARGET.salt),
            vitC: total(ON_TARGET.vitC),
            magnesium: total(ON_TARGET.magnesium),
          },
          { logDate: '2026-08-04' }
        ),
        NUTRITION_TEST_TARGETS,
        { isFlare: false }
      ),
    ];
    const result = summarisePeriod('fiber', days, MIN_EVALUABLE_DAYS.week);
    expect(result.medianRatio).toBeCloseTo(1, 6);
  });

  it('sorts the scoreboard worst first', () => {
    const days = Array.from({ length: 6 }, (_, index) =>
      nutritionDay(
        dayWith(
          {
            fiber: total(10), // always short
            calcium: total(ON_TARGET.calcium),
            salt: total(ON_TARGET.salt),
            vitC: total(ON_TARGET.vitC),
            magnesium: total(ON_TARGET.magnesium),
          },
          { logDate: addDays(START, index) }
        ),
        NUTRITION_TEST_TARGETS,
        { isFlare: false }
      )
    );
    const board = periodScoreboard(days, MIN_EVALUABLE_DAYS.week);
    expect(board[0].key).toBe('fiber');
    expect(board[0].shareInTarget).toBe(0);
  });
});

describe('Wochenkadenz', () => {
  const weekly = new Map<NutrientKey, ReturnType<typeof minTarget>>([
    ['epaDha', minTarget(1, { cadence: 'weekly' })],
  ]);

  /*
   * The case this exists for: two oily-fish meals a week is exactly the
   * recommendation. Compared day by day it would read as five misses.
   */
  it('averages a weekly target over seven days', () => {
    const days = [
      dayWith({ epaDha: total(0) }, { logDate: '2026-08-01' }),
      dayWith({ epaDha: total(0) }, { logDate: '2026-08-02' }),
      dayWith({ epaDha: total(0) }, { logDate: '2026-08-03' }),
      dayWith({ epaDha: total(0) }, { logDate: '2026-08-04' }),
      dayWith({ epaDha: total(0) }, { logDate: '2026-08-05' }),
      dayWith({ epaDha: total(0) }, { logDate: '2026-08-06' }),
      dayWith({ epaDha: total(7) }, { logDate: '2026-08-07' }),
    ];
    const comparables = weeklyComparables(days, weekly);
    expect(comparables[6].epaDha?.total).toBeCloseTo(1, 10);

    const assessed = nutritionDay(days[6], weekly, {
      isFlare: false,
      comparable: comparables[6],
    });
    expect(assessed.nutrients[0].status).toBe('met');
  });

  /* A week with one measurable day does not get to speak for the other six. */
  it('deflates the coverage by how much of the week was measurable', () => {
    const days = [
      dayWith({ epaDha: total(null) }, { logDate: '2026-08-01' }),
      dayWith({ epaDha: total(null) }, { logDate: '2026-08-02' }),
      dayWith({ epaDha: total(7) }, { logDate: '2026-08-03' }),
    ];
    const comparables = weeklyComparables(days, weekly);
    expect(comparables[2].epaDha?.coverage).toBeCloseTo(1 / 3, 10);
  });

  it('leaves a nutrient with no measurement at all as null', () => {
    const days = [dayWith({ epaDha: total(null) }, { logDate: '2026-08-01' })];
    expect(weeklyComparables(days, weekly)[0].epaDha?.total).toBeNull();
  });
});

describe('byIsoWeek', () => {
  it('keeps the turn of the year in the right week', () => {
    const days = [
      { ...perfect('2026-12-31'), logDate: '2026-12-31' },
      { ...perfect('2027-01-01'), logDate: '2027-01-01' },
    ];
    const weeks = byIsoWeek(days);
    expect(weeks).toHaveLength(1);
    expect(weeks[0].week).toBe('2026-W53');
  });
});

describe('computeNutritionStreak', () => {
  it('is empty for an empty range', () => {
    const result = computeNutritionStreak([], START, START);
    expect(result.current).toBe(0);
    expect(result.days).toHaveLength(1);
    expect(result.days[0].state).toBe('future');
    expect(EMPTY_NUTRITION_STREAK.current).toBe(0);
  });

  it('counts consecutive good days', () => {
    const days = [perfect('2026-08-01'), perfect('2026-08-02'), perfect('2026-08-03')];
    const result = computeNutritionStreak(days, '2026-08-01', '2026-08-04');
    expect(result.current).toBe(3);
    expect(result.goodDays).toBe(3);
  });

  it('never breaks on the current day', () => {
    const days = [perfect('2026-08-01'), poor('2026-08-02')];
    const result = computeNutritionStreak(days, '2026-08-01', '2026-08-02');
    expect(result.current).toBe(1);
    expect(result.days[1].state).toBe('future');
  });

  /*
   * The flare rule, as a run rather than a ratio: it does not break, does not
   * count, and does not spend a protection day. Same shape as medicationRun's
   * day with no dose due.
   */
  it('carries straight through a flare day without spending anything', () => {
    const days = [
      perfect('2026-08-01'),
      poor('2026-08-02', true),
      perfect('2026-08-03'),
    ];
    const result = computeNutritionStreak(days, '2026-08-01', '2026-08-04');
    expect(result.current).toBe(2);
    expect(result.days[1].state).toBe('neutral');
    expect(result.neutralDays).toBe(1);
    expect(result.jokersAvailable).toBe(0);
  });

  it('treats a day it cannot assess exactly like a flare day', () => {
    const days = [
      perfect('2026-08-01'),
      unreliable('2026-08-02'),
      perfect('2026-08-03'),
    ];
    const result = computeNutritionStreak(days, '2026-08-01', '2026-08-04');
    expect(result.current).toBe(2);
    expect(result.days[1].state).toBe('neutral');
  });

  it('breaks on a genuinely poor day when no protection is in stock', () => {
    const days = [perfect('2026-08-01'), poor('2026-08-02'), perfect('2026-08-03')];
    const result = computeNutritionStreak(days, '2026-08-01', '2026-08-04');
    expect(result.days[1].state).toBe('missed');
    expect(result.current).toBe(1);
    expect(result.longest).toBe(1);
  });

  it('earns a protection day every seven good days and spends it on a gap', () => {
    const days = Array.from({ length: NUTRITION_JOKER_EARN_EVERY }, (_, index) =>
      perfect(addDays(START, index))
    );
    days.push(poor(addDays(START, NUTRITION_JOKER_EARN_EVERY)));
    days.push(perfect(addDays(START, NUTRITION_JOKER_EARN_EVERY + 1)));

    const result = computeNutritionStreak(
      days,
      START,
      addDays(START, NUTRITION_JOKER_EARN_EVERY + 2)
    );
    expect(result.days[NUTRITION_JOKER_EARN_EVERY].state).toBe('joker');
    expect(result.current).toBe(NUTRITION_JOKER_EARN_EVERY + 2);
    expect(result.jokersAvailable).toBe(0);
  });

  it('never stockpiles more protection days than the cap', () => {
    const count = NUTRITION_JOKER_EARN_EVERY * (NUTRITION_JOKER_MAX + 2);
    const days = Array.from({ length: count }, (_, index) =>
      perfect(addDays(START, index))
    );
    const result = computeNutritionStreak(days, START, addDays(START, count));
    expect(result.jokersAvailable).toBe(NUTRITION_JOKER_MAX);
  });
});
