import { describe, expect, it } from 'vitest';
import { NUTRIENT_TARGETS, TARGET_KEYS } from '../catalog';
import {
  PAL_FACTOR,
  WEIGHT_LOSS_DEFICIT,
  ageFromBirthYear,
  energyTargetKcal,
  gramsForEnergyShare,
  referenceWeightSeries,
  restingEnergyKcal,
} from '../formulas';
import { deriveTargets, profileForDay, targetContext } from '../derive';
import { SOURCES } from '../sources';
import type { TargetContext } from '../types';

function ctx(overrides: Partial<Omit<TargetContext, 'energyKcal'>> = {}) {
  return targetContext({
    referenceSex: 'female',
    ageYears: 45,
    heightCm: 165,
    weightKg: 65,
    activityLevel: 'light',
    goal: 'maintain',
    hasSarcopenia: false,
    menopauseStage: null,
    dietForm: 'omnivore',
    renalImpairment: false,
    proteinMaxGPerKg: null,
    steroidLongTerm: false,
    ...overrides,
  });
}

describe('Mifflin-St Jeor', () => {
  it('matches the hand-computed value for a man', () => {
    // 10*80 + 6.25*180 - 5*40 + 5 = 800 + 1125 - 200 + 5
    expect(
      restingEnergyKcal({ sex: 'male', weightKg: 80, heightCm: 180, ageYears: 40 })
    ).toBe(1730);
  });

  it('matches the hand-computed value for a woman', () => {
    // 10*65 + 6.25*165 - 5*45 - 161 = 650 + 1031.25 - 225 - 161
    expect(
      restingEnergyKcal({ sex: 'female', weightKg: 65, heightCm: 165, ageYears: 45 })
    ).toBeCloseTo(1295.25, 5);
  });

  it('multiplies by the activity factor', () => {
    const target = energyTargetKcal({
      sex: 'male',
      weightKg: 80,
      heightCm: 180,
      ageYears: 40,
      activityLevel: 'light',
      goal: 'maintain',
    });
    expect(target).toBeCloseTo(1730 * PAL_FACTOR.light, 5);
  });

  /*
   * With the current 15 % deficit the floor never actually bites — the lowest
   * activity factor is 1.2 and 1.2 * 0.85 is still above 1. It is a guard
   * against a future, larger deficit, and this test is what keeps it honest:
   * raise WEIGHT_LOSS_DEFICIT past ~16.7 % and the clamp starts doing work
   * rather than silently prescribing under-eating.
   */
  it('never puts a weight-loss target below the resting expenditure', () => {
    const person = {
      sex: 'female' as const,
      weightKg: 65,
      heightCm: 165,
      ageYears: 45,
    };
    const ree = restingEnergyKcal(person);
    for (const level of Object.keys(PAL_FACTOR) as (keyof typeof PAL_FACTOR)[]) {
      const target = energyTargetKcal({ ...person, activityLevel: level, goal: 'lose' });
      expect(target, level).toBeGreaterThanOrEqual(ree);
    }
  });

  it('applies the deficit as a share of the maintenance need', () => {
    const person = {
      sex: 'male' as const,
      weightKg: 80,
      heightCm: 180,
      ageYears: 40,
      activityLevel: 'moderate' as const,
    };
    const maintain = energyTargetKcal({ ...person, goal: 'maintain' });
    const lose = energyTargetKcal({ ...person, goal: 'lose' });
    expect(lose).toBeCloseTo(maintain * (1 - WEIGHT_LOSS_DEFICIT), 6);
  });
});

describe('Energieprozent-Ziele', () => {
  /*
   * The mistake this pins: computing the saturated-fat limit from the energy
   * actually eaten would let a 3500 kcal day raise its own limit.
   */
  it('divides the target energy, never the energy that was eaten', () => {
    const context = ctx();
    const satFat = NUTRIENT_TARGETS.satFat!.resolve(context)!;
    const expected = gramsForEnergyShare(context.energyKcal!, 0.1, 'fat');
    expect(satFat.max).toBeCloseTo(expected, 6);

    // Same person, a huge day: the limit does not move, because it never saw
    // the day's intake at all.
    const again = NUTRIENT_TARGETS.satFat!.resolve(ctx())!;
    expect(again.max).toBeCloseTo(satFat.max!, 6);
  });

  it('has no energy-percent target when the energy need is unknown', () => {
    const satFat = NUTRIENT_TARGETS.satFat!.resolve(ctx({ heightCm: null }))!;
    expect(satFat.max).toBeNull();
    expect(satFat.unavailableReason).not.toBeNull();
  });
});

describe('Eiweiß', () => {
  it('is 1,0 to 1,2 g je kg by default', () => {
    const target = NUTRIENT_TARGETS.protein!.resolve(ctx())!;
    expect(target.min).toBeCloseTo(65, 6);
    expect(target.bandMax).toBeCloseTo(78, 6);
    expect(target.max).toBeNull();
  });

  it('rises to 1,5 g je kg with sarcopenia', () => {
    const target = NUTRIENT_TARGETS.protein!.resolve(ctx({ hasSarcopenia: true }))!;
    expect(target.min).toBeCloseTo(97.5, 6);
  });

  /*
   * The precedence that matters clinically: a raised requirement is a
   * recommendation, a renal cap is a restriction someone prescribed.
   */
  it('lets the renal cap win over the sarcopenia raise', () => {
    const target = NUTRIENT_TARGETS.protein!.resolve(
      ctx({ hasSarcopenia: true, renalImpairment: true, proteinMaxGPerKg: 0.8 })
    )!;
    expect(target.max).toBeCloseTo(52, 6); // 0.8 * 65
    expect(target.min).toBeCloseTo(52, 6); // capped, not 1.5 g/kg
    expect(target.min!).toBeLessThanOrEqual(target.max!);
    expect(target.rationaleDe).toContain('Nierenerkrankung');
  });

  it('has no target at all without a body weight', () => {
    const target = NUTRIENT_TARGETS.protein!.resolve(ctx({ weightKg: null }))!;
    expect(target.min).toBeNull();
    expect(target.unavailableReason).not.toBeNull();
  });
});

describe('Kortison hebt Calcium und Vitamin D', () => {
  it('raises calcium from 1000 to 1200 mg', () => {
    expect(NUTRIENT_TARGETS.calcium!.resolve(ctx()).min).toBe(1000);
    expect(
      NUTRIENT_TARGETS.calcium!.resolve(ctx({ steroidLongTerm: true })).min
    ).toBe(1200);
  });

  it('raises vitamin D from 20 to 25 µg', () => {
    expect(NUTRIENT_TARGETS.vitD!.resolve(ctx()).min).toBe(20);
    expect(NUTRIENT_TARGETS.vitD!.resolve(ctx({ steroidLongTerm: true })).min).toBe(
      25
    );
  });
});

describe('Referenzgeschlecht', () => {
  /*
   * NULL means "cannot be derived". Not "assume male", not "take the stricter
   * of the two" — the same contract a nutrient that was never measured has.
   */
  it('leaves sex-dependent targets unavailable rather than defaulting', () => {
    const context = ctx({ referenceSex: null });
    for (const key of ['vitA', 'vitC', 'magnesium', 'zinc', 'iron'] as const) {
      const target = NUTRIENT_TARGETS[key]!.resolve(context)!;
      expect(target.min, key).toBeNull();
      expect(target.unavailableReason, key).not.toBeNull();
    }
  });

  it('still derives the targets that do not depend on sex', () => {
    const context = ctx({ referenceSex: null });
    expect(NUTRIENT_TARGETS.fiber!.resolve(context).min).toBe(30);
    expect(NUTRIENT_TARGETS.salt!.resolve(context).max).toBe(6);
    expect(NUTRIENT_TARGETS.arachidonic!.resolve(context).max).toBe(50);
  });
});

describe('Eisen und Zink', () => {
  it('is 15 mg before the menopause and 10 mg after', () => {
    expect(NUTRIENT_TARGETS.iron!.resolve(ctx({ menopauseStage: 'pre' })).min).toBe(
      15
    );
    expect(NUTRIENT_TARGETS.iron!.resolve(ctx({ menopauseStage: 'post' })).min).toBe(
      10
    );
    expect(NUTRIENT_TARGETS.iron!.resolve(ctx({ referenceSex: 'male' })).min).toBe(
      10
    );
  });

  it('takes the upper end of the zinc range on a plant-heavy diet', () => {
    expect(NUTRIENT_TARGETS.zinc!.resolve(ctx({ dietForm: 'omnivore' })).min).toBe(7);
    expect(NUTRIENT_TARGETS.zinc!.resolve(ctx({ dietForm: 'vegan' })).min).toBe(10);
    expect(
      NUTRIENT_TARGETS.zinc!.resolve(
        ctx({ referenceSex: 'male', dietForm: 'vegan' })
      ).min
    ).toBe(16);
  });
});

describe('Katalog-Struktur', () => {
  it('gives every target a source that exists', () => {
    const context = ctx();
    for (const key of TARGET_KEYS) {
      const resolved = NUTRIENT_TARGETS[key]!.resolve(context)!;
      expect(resolved.sourceKeys.length, key).toBeGreaterThan(0);
      for (const source of resolved.sourceKeys) {
        expect(SOURCES[source], `${key} -> ${source}`).toBeDefined();
      }
    }
  });

  it('gives every target at least one bound or a reason it has none', () => {
    const context = ctx();
    for (const key of TARGET_KEYS) {
      const resolved = NUTRIENT_TARGETS[key]!.resolve(context)!;
      const hasBound = resolved.min !== null || resolved.max !== null;
      expect(hasBound || resolved.unavailableReason !== null, key).toBe(true);
    }
  });

  it('keeps energy, folate, iron and the ratio out of the score', () => {
    expect(NUTRIENT_TARGETS.energy!.inScore).toBe(false);
    expect(NUTRIENT_TARGETS.folate!.inScore).toBe(false);
    expect(NUTRIENT_TARGETS.iron!.inScore).toBe(false);
    expect(NUTRIENT_TARGETS.n6n3Ratio!.inScore).toBe(false);
  });

  it('never judges iron', () => {
    expect(NUTRIENT_TARGETS.iron!.showVerdict).toBe(false);
    expect(NUTRIENT_TARGETS.iron!.cautionDe).toContain('Entzündungsanämie');
  });

  it('offers no selenium target', () => {
    expect(TARGET_KEYS).not.toContain('selenium');
  });
});

describe('Übersteuern', () => {
  it('replaces the values but not the direction', () => {
    const targets = deriveTargets(ctx(), [
      {
        nutrientKey: 'fiber',
        min: 40,
        max: null,
        unit: 'g',
        disabled: false,
        reason: 'Von der Ernährungsberatung so gesetzt',
      },
    ]);
    const fiber = targets.get('fiber')!;
    expect(fiber.min).toBe(40);
    expect(fiber.direction).toBe('min');
    expect(fiber.origin).toBe('override');
    expect(fiber.rationaleDe).toContain('Ernährungsberatung');
  });

  it('removes a disabled target entirely', () => {
    const targets = deriveTargets(ctx(), [
      {
        nutrientKey: 'sugar',
        min: null,
        max: null,
        unit: 'g',
        disabled: true,
        reason: null,
      },
    ]);
    expect(targets.has('sugar')).toBe(false);
  });

  it('ignores an override for a nutrient the catalogue does not target', () => {
    const targets = deriveTargets(ctx(), [
      {
        nutrientKey: 'phosphorus',
        min: 700,
        max: null,
        unit: 'mg',
        disabled: false,
        reason: null,
      },
    ]);
    expect(targets.has('phosphorus')).toBe(false);
  });
});

describe('referenceWeightSeries', () => {
  /*
   * Inclusive, unlike trailingMedian in raIndex.ts. There the day is excluded
   * so a spike cannot lift its own baseline; body weight has no such feedback,
   * and excluding the day would make the very first weighing unusable.
   */
  it('uses the first weighing on the day it was taken', () => {
    expect(referenceWeightSeries([64.5])).toEqual([64.5]);
  });

  it('is null until something has been weighed', () => {
    expect(referenceWeightSeries([null, null, 70])).toEqual([null, null, 70]);
  });

  it('smooths a single-day swing', () => {
    // 64, 64, 68 -> median 64, not the mean 65.33.
    const series = referenceWeightSeries([64, 64, 68]);
    expect(series[2]).toBe(64);
  });

  it('forgets values that fell out of the window', () => {
    const weights = [50, ...Array<number>(28).fill(80)];
    const series = referenceWeightSeries(weights, 28);
    expect(series[series.length - 1]).toBe(80);
  });
});

describe('profileForDay', () => {
  const base = {
    referenceSex: 'female' as const,
    birthYear: 1980,
    heightCm: 165,
    activityLevel: 'light' as const,
    goal: 'maintain' as const,
    hasSarcopenia: false,
    menopauseStage: null,
    dietForm: 'omnivore' as const,
    renalImpairment: false,
    proteinMaxGPerKg: null,
    weightSource: 'daily_log' as const,
    referenceWeightKg: null,
  };

  it('picks the version in force, not the newest', () => {
    const versions = [
      { ...base, validFrom: '2026-01-01', validTo: '2026-05-31', heightCm: 164 },
      { ...base, validFrom: '2026-06-01', validTo: null },
    ];
    expect(profileForDay(versions, '2026-03-01')?.heightCm).toBe(164);
    expect(profileForDay(versions, '2026-08-01')?.heightCm).toBe(165);
  });

  it('is null before the first version', () => {
    const versions = [{ ...base, validFrom: '2026-06-01', validTo: null }];
    expect(profileForDay(versions, '2026-01-01')).toBeNull();
  });
});

describe('ageFromBirthYear', () => {
  it('reads the year off the log date, never a wall clock', () => {
    expect(ageFromBirthYear(1980, '2026-08-23')).toBe(46);
    expect(ageFromBirthYear(null, '2026-08-23')).toBeNull();
  });
});
