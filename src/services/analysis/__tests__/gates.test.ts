import { describe, expect, it } from 'vitest';
import {
  GLOBAL_GATES,
  MODEL_A_GATES,
  MODEL_B_GATES,
  allPassed,
  gate,
  gateLabel,
  largestShortfall,
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

  it('reports the largest shortfall, not the first', () => {
    const gates = [
      gate('exposedMeals', 28, 30),
      gate('exposedDistinctDays', 2, 12),
      gate('unexposedMeals', 100, 60),
    ];
    expect(largestShortfall(gates)?.gate).toBe('exposedDistinctDays');
  });

  it('returns null when everything passed', () => {
    expect(largestShortfall([gate('exposedMeals', 40, 30)])).toBeNull();
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
    if (target?.status === 'not_yet') {
      expect(target.gates.some((g) => !g.passed)).toBe(true);
    }
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
      expect(finding.status).toBe('not_yet');
      expect(finding.effect).toBeNull();
    }
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
    expect(target?.status).toBe('not_yet');
    expect(target?.label).toBe('not_yet');
    expect(target?.gates.length).toBeGreaterThan(0);
    expect(target?.gates.some((g) => !g.passed)).toBe(true);
    // And it carries no fabricated estimate.
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
    const testedFoodTags = findings.filter(
      (f) => f.family === 'food_tag' && f.status === 'tested'
    ).length;

    expect(params.fdr.families.food_tag.m).toBe(testedFoodTags);
    expect(testedFoodTags).toBeLessThan(7);
  });
});
