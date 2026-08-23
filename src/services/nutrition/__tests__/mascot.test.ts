import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { NutrientKey } from '@/lib/nutrients';
import { nutritionDay } from '../score';
import { NUTRIENT_TARGETS } from '../targets/catalog';
import type { TargetValue } from '../targets/types';
import type { NutritionSummary } from '../period';
import type { MascotMood } from '../mascot';
import {
  BOND_STAGE_DAYS,
  WEEK_HAPPY_RATIO,
  mascotBond,
  mascotMoodForDay,
  mascotMoodForWeek,
} from '../mascot';
import {
  MOOD_INPUT_VALUE,
  NEGATIVE_MOODS,
} from '@/components/mascot/rive-asset';
import { NUTRITION_TEST_TARGETS, ON_TARGET } from './helpers';
import { dayWith, minTarget, total } from './fixtures';

/**
 * The mascot's mood, and above all the two orderings it must never lose.
 *
 * The one to read twice is "a breached limit outranks an unscorable day". It is
 * the coverage asymmetry from `coverage.ts` carried into a face, and it is one
 * `if` away from being wrong in the direction that matters: a mood that goes
 * worried because a day is thinly recorded would be telling someone their
 * incomplete diary was a bad diet.
 */

const PRIORITY: NutrientKey[] = ['protein', 'fiber', 'calcium', 'epaDha'];

/** A day through the real pipeline, so the statuses are the real statuses. */
function day(
  values: Partial<Record<NutrientKey, number | null>>,
  opts: {
    isFlare?: boolean;
    mainSlots?: number;
    coverage?: number;
    targets?: ReadonlyMap<NutrientKey, TargetValue>;
  } = {}
) {
  const totals: Partial<Record<NutrientKey, ReturnType<typeof total>>> = {};
  for (const [key, value] of Object.entries({ ...ON_TARGET, ...values })) {
    totals[key as NutrientKey] = total(value as number | null, {
      coverage: opts.coverage,
    });
  }
  return nutritionDay(
    dayWith(totals, { mainSlots: opts.mainSlots }),
    opts.targets ?? NUTRITION_TEST_TARGETS,
    { isFlare: opts.isFlare ?? false }
  );
}

function moodOf(
  values: Partial<Record<NutrientKey, number | null>>,
  opts: Parameters<typeof day>[1] = {}
) {
  return mascotMoodForDay({
    day: day(values, opts),
    blocked: null,
    priority: PRIORITY,
  });
}

describe('mascotMoodForDay', () => {
  it('says nothing at all without a profile', () => {
    const state = mascotMoodForDay({
      day: day({}),
      blocked: 'kein_profil',
      priority: PRIORITY,
    });
    expect(state.mood).toBe('neutral');
    expect(state.focus).toBeNull();
    expect(state.quiet).toBe('kein_profil');
  });

  it('says nothing on a day it was not given', () => {
    const state = mascotMoodForDay({ day: null, blocked: null });
    expect(state.mood).toBe('neutral');
    expect(state.focus).toBeNull();
  });

  /*
   * A flare day is neutral in `score.ts` — out of the numerator AND the
   * denominator. A face that reacted to it would be telling someone their
   * flare was a dietary failure, so the flare check sits above everything,
   * including a breached limit.
   */
  it('stays neutral on a flare day even with a perfect score', () => {
    const state = moodOf({}, { isFlare: true });
    expect(state.mood).toBe('neutral');
    expect(state.quiet).toBe('schub');
    expect(state.focus).toBeNull();
  });

  it('stays neutral on a flare day that also breached a limit', () => {
    const state = moodOf({ salt: 12 }, { isFlare: true });
    expect(state.mood).toBe('neutral');
    expect(state.quiet).toBe('schub');
  });

  /* Under-documentation is not under-nutrition. */
  it('gives no focus on a day too thin to score', () => {
    const state = moodOf({ fiber: 4, calcium: 100, magnesium: 20 }, { mainSlots: 1 });
    expect(state.mood).toBe('neutral');
    expect(state.quiet).toBe('zu_wenig_erfasst');
    expect(state.focus).toBeNull();
    expect(state.score).toBeNull();
  });

  /*
   * THE test of this file. Over a limit holds at any coverage, because the
   * grams that were measured were really eaten. Short of a minimum does not.
   * So a day with no score can still be worried, and only about the limit.
   */
  it('is concerned about a breached limit on a day with no score', () => {
    const state = moodOf({ salt: 12, fiber: 4 }, { mainSlots: 1 });
    expect(state.score).toBeNull();
    expect(state.mood).toBe('concerned');
    expect(state.focus?.key).toBe('salt');
    expect(state.focus?.kind).toBe('limit');
    expect(state.focus?.remaining).toBeNull();
  });

  it('is concerned even when coverage is thin', () => {
    const state = moodOf({ salt: 12 }, { coverage: 0.2 });
    expect(state.mood).toBe('concerned');
    expect(state.focus?.key).toBe('salt');
  });

  it('never turns a thinly covered gap into a worry', () => {
    const state = moodOf({ fiber: 4, calcium: 50 }, { coverage: 0.2 });
    expect(state.mood).not.toBe('concerned');
  });

  it('is happy on a day at target, with nothing to point at', () => {
    const state = moodOf({});
    expect(state.mood).toBe('happy');
    expect(state.focus).toBeNull();
    expect(state.score).not.toBeNull();
  });

  it('is curious about the weakest gap, with the amount still missing', () => {
    // Fibre sits at attainment 0 (half the target), magnesium at 0,33.
    const state = moodOf({ fiber: 15, magnesium: 200 });
    expect(state.mood).toBe('curious');
    expect(state.focus?.kind).toBe('gap');
    expect(state.focus?.key).toBe('fiber');
    expect(state.focus?.remaining).toBeCloseTo(15, 10);
    expect(state.focus?.labelDe).toBeTruthy();
  });

  it('ranks by attainment, not by which nutrient we like', () => {
    // Magnesium at 0 beats fibre at 0,07 even though fibre ranks higher in
    // PRIORITY — the priority list is a tie-break, not a thumb on the scale.
    const state = moodOf({ fiber: 16, magnesium: 150 });
    expect(state.focus?.key).toBe('magnesium');
  });

  it('breaks a tie by the day priority', () => {
    // Both flat zero on attainment; fibre comes before calcium in PRIORITY.
    const state = moodOf({ fiber: 15, calcium: 500 });
    expect(state.mood).toBe('curious');
    expect(state.focus?.key).toBe('fiber');
  });

  it('prefers a breached limit over a bigger relative gap', () => {
    const state = moodOf({ salt: 6.5, fiber: 1, calcium: 10 });
    expect(state.mood).toBe('concerned');
    expect(state.focus?.key).toBe('salt');
  });

  it('picks the limit furthest past its bound', () => {
    const targets = new Map(NUTRITION_TEST_TARGETS);
    targets.set('sugar', { ...minTarget(0), direction: 'max', min: null, max: 50 });
    const state = mascotMoodForDay({
      day: day({ salt: 6.6, sugar: 200 }, { targets }),
      blocked: null,
      priority: PRIORITY,
    });
    expect(state.mood).toBe('concerned');
    expect(state.focus?.key).toBe('sugar');
  });

  it('passes a weekly cadence through so the sentence can say so', () => {
    const targets = new Map(NUTRITION_TEST_TARGETS);
    targets.set('fiber', minTarget(30, { cadence: 'weekly' }));
    const state = mascotMoodForDay({
      day: day({ fiber: 15, magnesium: 150 }, { targets }),
      blocked: null,
      priority: PRIORITY,
    });
    expect(state.focus?.key).toBe('fiber');
    expect(state.focus?.cadence).toBe('weekly');
  });

  /*
   * The guard that keeps this module honest for good.
   *
   * `assessNutrient` already reports 'unknown' for every nutrient with
   * showVerdict false, so a mood derived from `status` can never point at one.
   * This breaks the moment somebody compares raw values in `mascot.ts` — which
   * would put iron back on screen as a shortfall and nudge towards a supplement
   * that cannot work in anaemia of inflammation.
   */
  it('never points at a nutrient that carries no verdict', () => {
    const unjudged = Object.values(NUTRIENT_TARGETS)
      .filter((definition) => definition !== undefined && !definition.showVerdict)
      .map((definition) => definition.key);

    expect(unjudged.length).toBeGreaterThan(0);

    for (const key of unjudged) {
      const targets = new Map(NUTRITION_TEST_TARGETS);
      targets.set(key, minTarget(1000));
      const state = mascotMoodForDay({
        day: day({ [key]: 1 }, { targets }),
        blocked: null,
        priority: PRIORITY,
      });
      expect(state.focus?.key, key).not.toBe(key);
      expect(state.mood, key).not.toBe('concerned');
    }
  });

  it('is deterministic', () => {
    const values = { fiber: 16, magnesium: 150, calcium: 700 };
    expect(moodOf(values)).toEqual(moodOf(values));
  });
});

describe('mascotMoodForWeek', () => {
  const summary = (over: Partial<NutritionSummary> = {}): NutritionSummary => ({
    assessableDays: 7,
    goodDays: 6,
    ratio: 6 / 7,
    average: 82,
    flareDaysSkipped: 0,
    unreliableDays: 0,
    weakest: [{ key: 'fiber', labelDe: 'Ballaststoffe', days: 3 }],
    ...over,
  });

  it('stays quiet below the evaluable-days gate', () => {
    const state = mascotMoodForWeek({
      summary: summary({ assessableDays: 3, goodDays: 3, ratio: 1 }),
      minEvaluableDays: 4,
    });
    expect(state.mood).toBe('neutral');
    expect(state.quiet).toBe('zu_wenig_erfasst');
  });

  it('is happy over the ratio bar', () => {
    const state = mascotMoodForWeek({ summary: summary(), minEvaluableDays: 4 });
    expect(state.mood).toBe('happy');
    expect(state.score).toBe(82);
  });

  it('is curious below it, pointing at the weakest nutrient', () => {
    const state = mascotMoodForWeek({
      summary: summary({ goodDays: 1, ratio: 1 / 7 }),
      minEvaluableDays: 4,
    });
    expect(state.mood).toBe('curious');
    expect(state.focus?.key).toBe('fiber');
    // A count of days is not a measured shortfall — no number, no target.
    expect(state.focus?.remaining).toBeNull();
    expect(state.focus?.target).toBeNull();
  });

  it('is never concerned over a window', () => {
    for (const ratio of [0, 0.1, WEEK_HAPPY_RATIO, 1]) {
      const state = mascotMoodForWeek({
        summary: summary({ ratio }),
        minEvaluableDays: 4,
      });
      expect(state.mood).not.toBe('concerned');
    }
  });
});

describe('mascotBond', () => {
  it('counts recorded days, and never goes backwards', () => {
    let previous = -1;
    for (let days = 0; days <= 200; days += 1) {
      const bond = mascotBond(days);
      expect(bond.stage).toBeGreaterThanOrEqual(previous);
      previous = bond.stage;
    }
  });

  it('changes stage exactly at the documented thresholds', () => {
    BOND_STAGE_DAYS.forEach((threshold, index) => {
      expect(mascotBond(threshold).stage).toBe(index);
      if (threshold > 0) expect(mascotBond(threshold - 1).stage).toBe(index - 1);
    });
  });

  it('survives nonsense without inventing a stage', () => {
    expect(mascotBond(-5)).toEqual({ stage: 0, days: 0 });
    expect(mascotBond(3.7).days).toBe(3);
  });
});

/*
 * `mascot.ts` is imported by server components that render for a chosen day,
 * not only for today. A clock read in there would make the mood depend on when
 * the page happened to render, and `Math.random` would make it flicker.
 */
describe('reinheit', () => {
  it('reads no clock and rolls no dice', () => {
    for (const file of ['src/services/nutrition/mascot.ts']) {
      const source = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ');
      expect(source, file).not.toMatch(/new Date|Date\.now|Math\.random/);
      expect(source, file).not.toMatch(/todayLogDate/);
    }
  });
});

/**
 * The asset contract, checked from the side that knows what the moods mean.
 *
 * The objection to this artwork was that it carries only one unhappy face. That
 * is the right number, and this test is what keeps it the right number: the only
 * state this app can justify a negative expression for is a measured value above
 * a scored limit. If a second mood ever maps onto an unhappy face, something
 * upstream has started treating a missing record as a bad diet.
 */
describe('das Stimmungs-Mapping', () => {
  const MOODS: MascotMood[] = ['happy', 'concerned', 'curious', 'neutral'];

  it('has exactly one negative expression, and it is the limit', () => {
    expect(NEGATIVE_MOODS).toEqual(['concerned']);
  });

  it('maps every mood to a distinct input value', () => {
    const values = MOODS.map((mood) => MOOD_INPUT_VALUE[mood]);
    for (const value of values) expect(Number.isFinite(value)).toBe(true);
    expect(new Set(values).size).toBe(MOODS.length);
  });

  /*
   * The reachability half: a gap and a thin day must be able to occur without
   * ever producing the mood the unhappy face is wired to.
   */
  it('reaches the negative expression only through a breached limit', () => {
    const overLimit = moodOf({ salt: 12 });
    expect(NEGATIVE_MOODS).toContain(overLimit.mood);
    expect(overLimit.focus?.kind).toBe('limit');

    for (const state of [
      moodOf({ fiber: 15, calcium: 500 }),
      moodOf({ fiber: 4 }, { mainSlots: 1 }),
      moodOf({}, { isFlare: true }),
      moodOf({}),
    ]) {
      expect(NEGATIVE_MOODS).not.toContain(state.mood);
    }
  });
});
