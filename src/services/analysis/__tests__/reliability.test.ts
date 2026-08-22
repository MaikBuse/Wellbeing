import { describe, expect, it } from 'vitest';
import {
  MIN_BLOCKS_FOR_INTERVAL,
  RELIABILITY_THRESHOLDS,
  actionableBindingGate,
  bindingGate,
  factorGates,
  gate,
  hasEnoughBlocks,
  intervalIsSupported,
  reliability,
} from '@/services/analysis/gates';
import { computeSuspicionRanking } from '@/services/analysis/run';
import { standardTagSpecs, synthesiseFacts } from './synthetic';

const RUN = {
  seed: 'reliability',
  timeZone: 'Europe/Berlin',
  dayStartHour: 4,
  countTraceExposure: false,
  bootstrapResamples: 400,
  rotationResamples: 400,
};

describe('reliability', () => {
  it('is the weakest link, not an average', () => {
    // A factor with plenty of unexposed meals and almost no exposed ones is
    // limited by the exposed arm; averaging would hide that behind the arm that
    // is fine.
    const gates = [gate('exposedMeals', 12, 30), gate('unexposedMeals', 400, 60)];
    expect(reliability(gates).sufficiency).toBeCloseTo(12 / 30, 10);
  });

  it('is 4 out of 4 only when every gate is met', () => {
    const met = [gate('exposedMeals', 40, 30), gate('exposedDistinctDays', 20, 12)];
    expect(reliability(met).level).toBe(4);
    expect(reliability(met).bindingGate).toBeNull();

    const short = [...met, gate('notableReactionsTotal', 7, 8)];
    expect(reliability(short).level).toBeLessThan(4);
  });

  it('buckets on the documented thresholds', () => {
    const at = (ratio: number) =>
      reliability([gate('exposedDays', Math.round(ratio * 100), 100)]).level;

    expect(at(1)).toBe(4);
    expect(at(RELIABILITY_THRESHOLDS.level3)).toBe(3);
    expect(at(RELIABILITY_THRESHOLDS.level3 - 0.01)).toBe(2);
    expect(at(RELIABILITY_THRESHOLDS.level2)).toBe(2);
    expect(at(RELIABILITY_THRESHOLDS.level2 - 0.01)).toBe(1);
    expect(at(0)).toBe(1);
  });

  it('EXCLUDES the global gates, or it would be the same number for every factor', () => {
    // The failure this guards against: `trackedDays` and `daysWithRaIndex` are
    // identical across all 42 factors, so a min that included them would
    // collapse into one app-wide progress bar wearing a per-factor costume —
    // and the sort key would discriminate nothing for the first sixty days.
    const globals = [
      gate('trackedDays', 20, 60, 'global'),
      gate('daysWithRaIndex', 15, 45, 'global'),
    ];

    const strong = reliability([...globals, gate('exposedMeals', 30, 30)]);
    const weak = reliability([...globals, gate('exposedMeals', 3, 30)]);

    expect(strong.level).toBe(4);
    expect(weak.level).toBe(1);
    // Same globals, very different scores — which is the whole point.
    expect(strong.sufficiency).toBeGreaterThan(weak.sufficiency);
    expect(factorGates([...globals, gate('exposedMeals', 3, 30)])).toHaveLength(1);
  });

  it('counts how many requirements are already met, which a min cannot say', () => {
    // Same weakest link, different situations: one requirement done versus none.
    // Folding that into the score would stop it being invertible into an action,
    // so it is reported beside it instead.
    const one = reliability([gate('a', 100, 100), gate('b', 5, 100)]);
    const both = reliability([gate('a', 5, 100), gate('b', 5, 100)]);

    expect(one.sufficiency).toBeCloseTo(both.sufficiency, 10);
    expect(one.gatesMet).toBe(1);
    expect(both.gatesMet).toBe(0);
    expect(one.gatesTotal).toBe(2);
  });

  it('never names an outcome as the thing to record more of', () => {
    // "Es fehlen noch 8 merkliche Reaktionen" — telling someone with RA that
    // she needs eight more flare-ups — is the one sentence this must not emit.
    const gates = [
      gate('notableReactionsTotal', 0, 8),
      gate('exposedDistinctDays', 6, 12),
    ];
    expect(bindingGate(gates)?.gate).toBe('notableReactionsTotal');
    expect(actionableBindingGate(gates)?.gate).toBe('exposedDistinctDays');
    expect(reliability(gates).bindingGate).toBe('exposedDistinctDays');
    // The outcome gate still caps the SCORE — it is only kept out of the copy.
    expect(reliability(gates).sufficiency).toBe(0);
  });
});

describe('interval support', () => {
  it('waits for the arm-support gates', () => {
    expect(
      intervalIsSupported([
        gate('exposedMeals', 100, 30),
        gate('exposedDistinctDays', 11, 12),
      ])
    ).toBe(false);
    expect(
      intervalIsSupported([
        gate('exposedMeals', 100, 30),
        gate('exposedDistinctDays', 12, 12),
      ])
    ).toBe(true);
  });

  it('is false when there is no arm-support gate to check', () => {
    // Better to withhold than to assume: a gate list with nothing about arm
    // support has not shown that the arms can move the bootstrap.
    expect(intervalIsSupported([gate('exposedMeals', 100, 30)])).toBe(false);
  });

  it('needs four blocks before a percentile has tails', () => {
    // At 10 days with a 28-day block there are 1.27 blocks per resample and 95 %
    // day coverage — each draw is essentially a rotation, and both tail
    // percentiles are set by one block.
    expect(hasEnoughBlocks(10, 28)).toBe(false);
    expect(hasEnoughBlocks(40, 28)).toBe(false);
    expect(hasEnoughBlocks(MIN_BLOCKS_FOR_INTERVAL * 28, 28)).toBe(true);
    expect(hasEnoughBlocks(365, 7)).toBe(true);
  });
});

describe('the one-exposed-day case, end to end', () => {
  /**
   * The artefact this whole guard exists for.
   *
   * `riskDifference` is exposedNotable/exposedMeals, which is scale-invariant:
   * drawing one exposed day k times leaves the ratio unchanged. So a single-day
   * arm contributes exactly zero bootstrap variance and the interval reports the
   * OTHER arm's precision — measured at 2.5 percentage points wide from one
   * meal, and excluding zero on 100 % of null datasets.
   */
  it('is visible with counts and never with an interval', () => {
    const facts = synthesiseFacts({
      seed: 'one-day',
      days: 200,
      tags: [
        {
          key: 'once',
          window: 'early',
          // Almost never starts a run, and a run is one day long.
          runStartProbability: 0.003,
          runLength: 1,
          grams: 40,
        },
        ...standardTagSpecs(4),
      ],
    });
    const { findings } = computeSuspicionRanking(facts, RUN);
    const once = findings.find((f) => f.key === 'once');

    expect(once).toBeDefined();
    expect(once?.status).not.toBe('confirmatory');
    expect(once?.effect).toBeNull();
    expect(once?.label).toBeNull();
    expect(once?.reliability.level).toBe(1);
  });

  it('cannot be promoted by the sort keys either', () => {
    // `sortScore` is monotone in 1/n, so a low-n row would top any effect-based
    // ordering. Both keys are pinned to zero off the confirmatory path.
    const facts = synthesiseFacts({
      seed: 'one-day',
      days: 200,
      tags: [
        { key: 'once', window: 'early', runStartProbability: 0.003, runLength: 1, grams: 40 },
        ...standardTagSpecs(4),
      ],
    });
    const { findings } = computeSuspicionRanking(facts, RUN);
    for (const finding of findings.filter((f) => f.status !== 'confirmatory')) {
      expect(finding.sortScore).toBe(0);
      expect(finding.evidenceStrength).toBe(0);
    }
  });
});

describe('the weekday omnibus', () => {
  it('is never ranked, because a range cannot exclude zero', () => {
    // It used to take rank 1 on pure noise: the statistic is a range, so
    // `ciLow > 0` always held, `shrunkEffect` read that as evidence, and
    // `sortScore` came out above every genuine finding — from where it fed the
    // stability streak.
    const facts = synthesiseFacts({
      seed: 'weekday',
      days: 365,
      tags: standardTagSpecs(8),
      varyConfounders: true,
    });
    const { findings } = computeSuspicionRanking(facts, RUN);
    const weekday = findings.find((f) => f.key === 'weekday_pattern');

    expect(weekday).toBeDefined();
    expect(weekday?.sortScore).toBe(0);
    expect(weekday?.evidenceStrength).toBe(0);
    expect(weekday?.stability.weeksInTopFive).toBe(0);
  });
});
