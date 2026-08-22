import { describe, expect, it } from 'vitest';
import {
  GLOBAL_GATES,
  MODEL_A_GATES,
  MODEL_B_GATES,
  actionableBindingGate,
  allPassed,
  bindingGate,
  gate,
  gateLabel,
} from '@/services/analysis/gates';
import { computeSuspicionRanking } from '@/services/analysis/run';
import { standardTagSpecs, synthesiseFacts } from './synthetic';

const RUN = {
  seed: 'gates',
  timeZone: 'Europe/Berlin',
  dayStartHour: 4,
  countTraceExposure: false,
  bootstrapResamples: 200,
  rotationResamples: 200,
};

describe('gate', () => {
  it('passes when the count reaches the requirement', () => {
    expect(gate('exposedMeals', 30, 30).passed).toBe(true);
    expect(gate('exposedMeals', 29, 30).passed).toBe(false);
  });

  it('has a German label for the UI, kept out of the stored row', () => {
    // The label is presentation, so it lives in code and not in
    // analysis_run.results — otherwise a copy fix becomes a data migration.
    expect(gateLabel('exposedDistinctDays')).toContain('Tage');
    expect(gate('exposedDistinctDays', 3, 12)).not.toHaveProperty('labelDe');
  });

  it('binds on the smallest RATIO, not the largest shortfall', () => {
    // 38 of 60 is a shortfall of 22 but a ratio of 0.63; 12 of 30 is a shortfall
    // of 18 but a ratio of 0.40. The second is what actually caps the score, so
    // naming the first would send her off recording the wrong thing.
    const gates = [
      gate('trackedDays', 38, 60, 'global'),
      gate('exposedMeals', 12, 30),
    ];
    expect(bindingGate(gates)?.gate).toBe('exposedMeals');
  });

  it('never asks for more notable reactions', () => {
    // The one sentence this feature must not produce. `notableReactionsTotal`
    // has the worst ratio here by far, and is still not the one named.
    const gates = [
      gate('notableReactionsTotal', 0, 8),
      gate('exposedDistinctDays', 6, 12),
    ];
    expect(bindingGate(gates)?.gate).toBe('notableReactionsTotal');
    expect(actionableBindingGate(gates)?.gate).toBe('exposedDistinctDays');
  });

  it('never asks her to eat less as if it were recording', () => {
    const gates = [gate('unexposedMeals', 3, 60), gate('exposedMeals', 20, 30)];
    expect(actionableBindingGate(gates)?.gate).toBe('exposedMeals');
  });

  it('breaks ratio ties by name rather than by input order', () => {
    // A never-eaten factor is 0/30 AND 0/12 — both ratio 0.
    const a = [gate('exposedMeals', 0, 30), gate('exposedDistinctDays', 0, 12)];
    const b = [gate('exposedDistinctDays', 0, 12), gate('exposedMeals', 0, 30)];
    expect(bindingGate(a)?.gate).toBe(bindingGate(b)?.gate);
  });

  it('returns null when everything passed', () => {
    expect(bindingGate([gate('exposedMeals', 40, 30)])).toBeNull();
    expect(allPassed([gate('exposedMeals', 40, 30)])).toBe(true);
  });
});

describe('the anti-clustering gates', () => {
  it('rejects many exposed meals crammed into few days', () => {
    // Forty exposed meals inside one week is ONE observation of a week of
    // bread, not forty. Without this gate a single fortnight of a new habit
    // looks like a well-powered comparison.
    const facts = synthesiseFacts({
      seed: 'clustered',
      days: 200,
      mealsPerDay: [4, 5],
      tags: [
        {
          key: 'burst',
          window: 'early',
          // One long run, so plenty of meals across very few distinct days.
          runStartProbability: 0.004,
          runLength: 8,
          grams: 40,
        },
        ...standardTagSpecs(4),
      ],
    });
    const { findings } = computeSuspicionRanking(facts, RUN);
    const target = findings.find((f) => f.key === 'burst');
    const distinctDays = target?.gates.find(
      (g) => g.gate === 'exposedDistinctDays'
    );

    expect(distinctDays).toBeDefined();
    expect(MODEL_A_GATES.exposedDistinctDays).toBe(12);
    // Unconditional now. The old version wrapped this in `if (status ===
    // 'not_yet')`, which after the rename would have asserted nothing while
    // still passing green.
    expect(target?.status).not.toBe('confirmatory');
    expect(target?.gates.some((g) => !g.passed)).toBe(true);
    // And with too few distinct days there is no interval to show.
    expect(target?.effect).toBeNull();
  });

  it('requires several separate exposure runs at day level', () => {
    expect(MODEL_B_GATES.exposedRuns).toBe(6);
  });
});

describe('the global gates', () => {
  it('put the whole day family on hold when there is too little history', () => {
    const facts = synthesiseFacts({
      seed: 'short-history',
      days: 40,
      tags: [
        {
          key: 'omega3',
          window: 'next_day',
          runStartProbability: 0.2,
          runLength: 3,
          grams: 40,
        },
      ],
      varyConfounders: true,
    });
    const { findings } = computeSuspicionRanking(facts, RUN);

    const dayFamily = findings.filter((f) => f.model === 'ra_next_day');
    expect(dayFamily.length).toBeGreaterThan(0);
    for (const finding of dayFamily) {
      // Visible, but never confirmatory: no verdict, no q-value, no rank, and
      // no place in the stability streak.
      expect(finding.status).not.toBe('confirmatory');
      expect(finding.label).toBeNull();
      expect(finding.qValue).toBeNull();
      expect(finding.rank).toBeNull();
      expect(finding.stability.weeksInTopFive).toBe(0);
    }

    // Whether an INTERVAL is offered is a separate question and depends on the
    // estimated block length, not on the global gates — at 40 days with a
    // seven-day block there are 5.7 blocks, which is above the floor. So this
    // asserts the guarantee that does hold: no verdict, whatever the interval.
    expect(dayFamily.every((f) => f.label === null)).toBe(true);
  });

  it('names the thresholds it enforces', () => {
    expect(GLOBAL_GATES.trackedDays).toBe(60);
    expect(GLOBAL_GATES.daysWithRaIndex).toBe(45);
  });
});

describe('a tag that fails a gate', () => {
  it('is reported, not hidden', () => {
    // The product reason: this tells her exactly what to record more of, and it
    // stops an unexamined factor from reading as an innocent one.
    const facts = synthesiseFacts({
      seed: 'hidden',
      days: 150,
      tags: [
        {
          key: 'never_eaten',
          window: 'mid',
          runStartProbability: 0,
          runLength: 1,
          grams: 40,
        },
        ...standardTagSpecs(3),
      ],
    });
    const { findings } = computeSuspicionRanking(facts, RUN);
    const target = findings.find((f) => f.key === 'never_eaten');

    expect(target).toBeDefined();
    // Never eaten means there is no exposed arm, so there is no contrast to
    // compute at all — distinct from "thin", which is `provisional`.
    expect(target?.status).toBe('not_computable');
    expect(target?.label).toBeNull();
    expect(target?.gates.length).toBeGreaterThan(0);
    expect(target?.gates.some((g) => !g.passed)).toBe(true);
    expect(target?.effect).toBeNull();
    expect(target?.qValue).toBeNull();
  });

  it('is excluded from the BH family size', () => {
    // Padding m with untested hypotheses would inflate the correction with
    // hypotheses that could not possibly have produced a discovery.
    const facts = synthesiseFacts({
      seed: 'family-size',
      days: 365,
      tags: [
        {
          key: 'never_eaten',
          window: 'mid',
          runStartProbability: 0,
          runLength: 1,
          grams: 40,
        },
        ...standardTagSpecs(6),
      ],
    });
    const { params, findings } = computeSuspicionRanking(facts, RUN);
    const foodTags = findings.filter((f) => f.family === 'food_tag');
    const confirmatory = foodTags.filter((f) => f.status === 'confirmatory').length;
    const provisional = foodTags.filter((f) => f.status === 'provisional').length;

    expect(params.fdr.families.food_tag.m).toBe(confirmatory);

    // The premise, which the bare equality no longer carries: provisional
    // factors EXIST and are excluded from m. Without this the assertion above
    // is true by construction and asserts nothing.
    expect(provisional).toBeGreaterThan(0);
    expect(params.fdr.families.food_tag.m).toBeLessThan(confirmatory + provisional);
  });
});
