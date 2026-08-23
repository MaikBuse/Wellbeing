import { describe, expect, it } from 'vitest';
import type { NutrientKey } from '@/lib/nutrients';
import {
  MIN_RAMP_START,
  NUTRITION_GOOD_DAY,
  OVER_SLACK,
  TIER_WEIGHT,
  attainment,
  nutritionDay,
} from '../score';
import { NUTRITION_TEST_TARGETS, ON_TARGET, scoreOf } from './helpers';
import { dayWith, maxTarget, minTarget, total } from './fixtures';
import type { TargetValue } from '../targets/types';

describe('attainment', () => {
  const fibre = minTarget(30);

  it('is exactly 1 at the target', () => {
    expect(attainment(30, fibre)).toBe(1);
  });

  /*
   * 0,6 and not 0,8: the raw ratio overstates the bottom half. Half the fibre
   * target is not half a good day. And not 0 either, or the score would flip on
   * the rounding of a portion estimate.
   */
  it('is 0,6 at 80 % of a minimum', () => {
    expect(attainment(24, fibre)).toBeCloseTo(0.6, 10);
  });

  it('is 0 at and below half the target', () => {
    expect(attainment(15, fibre)).toBe(0);
    expect(attainment(0, fibre)).toBe(0);
    expect(attainment(MIN_RAMP_START * 30, fibre)).toBe(0);
  });

  it('does not reward triple the target', () => {
    expect(attainment(90, fibre)).toBe(1);
  });

  const salt = maxTarget(6);

  it('counts the limit itself as respected', () => {
    expect(attainment(6, salt)).toBe(1);
    expect(attainment(5.9, salt)).toBe(1);
  });

  it('is 0 at 150 % of a limit and never goes negative', () => {
    expect(attainment(OVER_SLACK * 6, salt)).toBe(0);
    expect(attainment(18, salt)).toBe(0);
    expect(attainment(600, salt)).toBe(0);
  });

  it('falls linearly between the limit and the slack point', () => {
    expect(attainment(7.5, salt)).toBeCloseTo(0.5, 10);
  });

  /*
   * Arachidonic acid gets a steeper edge than the default: 50 mg is a clinical
   * recommendation, not a rule of thumb, so zero arrives at 60 mg not 75.
   */
  it('honours a target-specific overSlack', () => {
    const aa = maxTarget(50, { overSlack: 1.2, unit: 'mg' });
    expect(attainment(60, aa)).toBe(0);
    expect(attainment(55, aa)).toBeCloseTo(0.5, 10);
    // The default slack would still give this one credit.
    expect(attainment(60, maxTarget(50))).toBeGreaterThan(0);
  });

  it('takes the worse of both parts when a target has two bounds', () => {
    const both: TargetValue = { ...minTarget(50), max: 60, direction: 'range' };
    expect(attainment(55, both)).toBe(1);
    expect(attainment(40, both)).toBeCloseTo(0.6, 10);
    // 1.5 * 60 = 90 is the zero point, so 80 sits a third of the way up.
    expect(attainment(80, both)).toBeCloseTo(1 / 3, 10);
  });

  /*
   * The band is a recommendation, not a limit. 1,5 g/kg of protein is above the
   * recommended range and must cost nothing.
   */
  it('ignores bandMax entirely', () => {
    const protein: TargetValue = {
      ...minTarget(65),
      bandMax: 78,
      direction: 'range',
    };
    expect(attainment(97, protein)).toBe(1);
    expect(attainment(78, protein)).toBe(1);
  });
});

describe('Tagesscore', () => {
  const targets = NUTRITION_TEST_TARGETS;
  const perfectTotals = {
    fiber: total(ON_TARGET.fiber),
    calcium: total(ON_TARGET.calcium),
    salt: total(ON_TARGET.salt),
    vitC: total(ON_TARGET.vitC),
    magnesium: total(ON_TARGET.magnesium),
  };

  it('is 100 when every assessable nutrient is on target', () => {
    expect(scoreOf(dayWith(perfectTotals), targets)).toBe(100);
  });

  /*
   * The single most important property in this file: a nutrient nobody measured
   * leaves the denominator. It is not a zero. The score must be identical to the
   * same day with that target simply absent from the catalogue.
   */
  it('drops an unmeasured nutrient from the denominator rather than scoring it 0', () => {
    const withUnmeasured = nutritionDay(
      dayWith({ ...perfectTotals, magnesium: total(null) }),
      targets,
      { isFlare: false }
    );

    const withoutTarget = new Map(targets);
    withoutTarget.delete('magnesium');
    const rest = { ...perfectTotals };
    delete (rest as Record<string, unknown>).magnesium;
    const withAbsent = nutritionDay(dayWith(rest), withoutTarget, {
      isFlare: false,
    });

    expect(withUnmeasured.score).toBe(withAbsent.score);
    expect(withUnmeasured.score).toBe(100);
    expect(withUnmeasured.assessableCount).toBe(withAbsent.assessableCount);
  });

  /*
   * An RA nutrient moves the score exactly twice as far as a general one, for
   * the identical shortfall. Pinned as arithmetic so nobody can quietly add a
   * third tier or re-file a nutrient into the heavier one.
   */
  it('weights an RA nutrient twice as heavily as a general one', () => {
    const perfect = scoreOf(dayWith(perfectTotals), targets) as number;
    // Both at 80 % of their target, so both land on attainment 0.6.
    const raShort = scoreOf(
      dayWith({ ...perfectTotals, fiber: total(24) }),
      targets
    ) as number;
    const generalShort = scoreOf(
      dayWith({ ...perfectTotals, vitC: total(80) }),
      targets
    ) as number;

    expect(perfect - raShort).toBeCloseTo(2 * (perfect - generalShort), 6);
    expect(TIER_WEIGHT.ra / TIER_WEIGHT.general).toBe(2);
  });

  it('never returns a negative score, however far over a limit', () => {
    const day = dayWith({
      ...perfectTotals,
      salt: total(60),
      fiber: total(0),
      calcium: total(0),
    });
    const score = scoreOf(day, targets) as number;
    expect(score).toBeGreaterThanOrEqual(0);
  });

  /*
   * Under-documentation is not under-nutrition. A day with one main slot has
   * structurally low totals; a low score would be the app pretending to know
   * the difference.
   */
  it('is null, not low, when only one main meal was recorded', () => {
    const day = dayWith(
      {
        fiber: total(8),
        calcium: total(200),
        salt: total(1),
        vitC: total(10),
        magnesium: total(40),
      },
      { mainSlots: 1 }
    );
    const result = nutritionDay(day, targets, { isFlare: false });
    expect(result.score).toBeNull();
    expect(result.reason).toBe('zu_wenig_erfasst');
  });

  it('is null when too little of the day was catalog-linked', () => {
    const day = dayWith(perfectTotals, { blsGramsShare: 0.3 });
    const result = nutritionDay(day, targets, { isFlare: false });
    expect(result.score).toBeNull();
    expect(result.reason).toBe('zu_wenig_bekannt');
  });

  /*
   * An unedited catalog entry is exactly 100 g, so without stated amounts the
   * totals are a pile of catalog values. That invalidates the macros too, not
   * just the micronutrients.
   */
  it('is null when the portions were mostly guessed, macros included', () => {
    const day = dayWith(perfectTotals, {
      portionEvidenceShare: 0.2,
      statedGrams: 200,
    });
    const result = nutritionDay(day, targets, { isFlare: false });
    expect(result.score).toBeNull();
    for (const nutrient of result.nutrients) {
      expect(nutrient.status, nutrient.key).toBe('unknown');
    }
  });

  it('is null for an empty day, never 0', () => {
    const result = nutritionDay(dayWith({}, { totalGrams: 0 }), targets, {
      isFlare: false,
    });
    expect(result.score).toBeNull();
  });

  it('keeps a flare day scorable but marks it', () => {
    const result = nutritionDay(dayWith(perfectTotals), targets, {
      isFlare: true,
    });
    expect(result.isFlare).toBe(true);
    expect(result.score).toBe(100);
  });

  it('sets the good-day bar below the recording bar', () => {
    // COMPLETE_DAY_THRESHOLD is 90 and measures a checklist that can be fully
    // ticked. This one measures a nutrient profile and must not.
    expect(NUTRITION_GOOD_DAY).toBeLessThan(90);
  });
});

describe('Grenzen sind strenger als Mindestziele', () => {
  const salt: [NutrientKey, TargetValue] = ['salt', maxTarget(6)];
  const fibre: [NutrientKey, TargetValue] = ['fiber', minTarget(30)];

  /*
   * The four cells of the asymmetry, one test each. An incompletely recorded
   * day can only UNDERSTATE intake, so:
   *   over a limit  -> provable at any coverage
   *   under a limit -> a claim, needs the data
   *   over a minimum -> provable at any coverage
   *   under a minimum -> a claim, needs the data
   */
  it('calls a limit exceeded even on a thinly measured day', () => {
    const day = dayWith({ salt: total(9, { coverage: 0.2 }) });
    const assessment = nutritionDay(day, new Map([salt]), { isFlare: false })
      .nutrients[0];
    expect(assessment.status).toBe('exceeded');
  });

  it('refuses to call a limit respected on a thinly measured day', () => {
    const day = dayWith({ salt: total(2, { coverage: 0.2 }) });
    const assessment = nutritionDay(day, new Map([salt]), { isFlare: false })
      .nutrients[0];
    expect(assessment.status).toBe('unknown');
    expect(assessment.isLowerBound).toBe(true);
  });

  it('calls a minimum met even on a thinly measured day', () => {
    const day = dayWith({ fiber: total(40, { coverage: 0.2 }) });
    const assessment = nutritionDay(day, new Map([fibre]), { isFlare: false })
      .nutrients[0];
    expect(assessment.status).toBe('met');
  });

  it('refuses to call a minimum missed on a thinly measured day', () => {
    const day = dayWith({ fiber: total(5, { coverage: 0.2 }) });
    const assessment = nutritionDay(day, new Map([fibre]), { isFlare: false })
      .nutrients[0];
    expect(assessment.status).toBe('unknown');
  });

  it('judges both directions once the nutrient is well covered', () => {
    const under = nutritionDay(dayWith({ salt: total(2) }), new Map([salt]), {
      isFlare: false,
    }).nutrients[0];
    expect(under.status).toBe('met');

    const short = nutritionDay(dayWith({ fiber: total(5) }), new Map([fibre]), {
      isFlare: false,
    }).nutrients[0];
    expect(short.status).toBe('missed');
  });
});

describe('Supplemente', () => {
  it('let a target be met on a day where the food was not measurable', () => {
    const vitD = new Map<NutrientKey, TargetValue>([
      ['vitD', minTarget(20, { unit: 'ug' })],
    ]);
    const day = dayWith({
      vitD: total(50, { coverage: 0, fromSupplement: 50 }),
    });
    const assessment = nutritionDay(day, vitD, { isFlare: false }).nutrients[0];
    expect(assessment.status).toBe('met');
    expect(assessment.total.fromSupplement).toBe(50);
  });
});
