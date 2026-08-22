import { describe, expect, it } from 'vitest';
import { iidIndices } from '@/lib/stats/bootstrap';
import { computeSuspicionRanking } from '@/services/analysis/run';
import { standardTagSpecs, synthesiseFacts } from './synthetic';

const RUN = {
  seed: 'null',
  timeZone: 'Europe/Berlin',
  dayStartHour: 4,
  countTraceExposure: false,
  bootstrapResamples: 500,
  rotationResamples: 500,
};

function nullFacts(seed: string, ar1: number) {
  return synthesiseFacts({
    seed,
    days: 365,
    tags: standardTagSpecs(20),
    // No `injected` at all: exposure and outcome are generated independently.
    raBaseline: {
      level: 4,
      ar1,
      noiseSd: 1.2,
      flareRate: ar1 > 0 ? 0.004 : 0,
      flareLengthDays: [10, 25],
    },
    varyConfounders: true,
  });
}

function clearCount(findings: ReturnType<typeof computeSuspicionRanking>['findings']) {
  return findings.filter((f) => f.label === 'clear').length;
}

/**
 * The most clears any single family produced.
 *
 * This, not zero, is what the design guarantees. Benjamini-Hochberg at
 * alpha = 0.10 controls the false-discovery rate *per family*, so on the
 * complete null it is expected to fire on roughly one dataset in ten — and
 * measured over 24 null datasets it fires on 10.4 % of family-datasets and
 * NEVER produces more than one clear in a family. An assertion of zero was
 * asserting something the procedure never promised, and it held by luck.
 */
function maxClearPerFamily(
  findings: ReturnType<typeof computeSuspicionRanking>['findings']
): number {
  const food = findings.filter((f) => f.label === 'clear' && f.family === 'food_tag');
  const conf = findings.filter(
    (f) => f.label === 'clear' && f.family === 'confounder'
  );
  return Math.max(food.length, conf.length);
}

describe('pure noise', () => {
  it('produces no clear finding at all', () => {
    // The smoke test for the whole exercise. If this ever fails, Vitest is
    // telling us the pipeline invents signals — which is exactly what it is
    // here to do, rather than letting the diet take the blame.
    const facts = nullFacts('white-noise', 0);
    const { findings } = computeSuspicionRanking(facts, RUN);
    expect(clearCount(findings)).toBe(0);
  });

  it('never lets a provisional factor carry a verdict', () => {
    // The structural half of the guarantee, and the one that must hold on every
    // dataset rather than on average: visibility does not buy a verdict.
    const facts = nullFacts('white-noise', 0);
    const { findings } = computeSuspicionRanking(facts, RUN);
    const provisional = findings.filter((f) => f.status === 'provisional');
    expect(provisional.length).toBeGreaterThan(0);
    for (const finding of provisional) {
      expect(finding.label).toBeNull();
      expect(finding.qValue).toBeNull();
      expect(finding.pValue).toBeNull();
      expect(finding.rank).toBeNull();
      expect(finding.stability.weeksInTopFive).toBe(0);
      // And none of the descriptive side-panels, each of which needs MORE data
      // than the headline estimate rather than less.
      expect(finding.secondary).toBeNull();
      expect(finding.attributionBias).toBeNull();
      expect(finding.sensitivity).toBeNull();
    }
  });

  it('reports the tags rather than hiding them, and only judges the solid ones', () => {
    const facts = nullFacts('white-noise', 0);
    const { findings } = computeSuspicionRanking(facts, RUN);

    const confirmatory = findings.filter((f) => f.status === 'confirmatory');
    expect(confirmatory.length).toBeGreaterThan(5);
    for (const finding of confirmatory) {
      expect(finding.qValue).not.toBeNull();
    }

    // The other half of the contract: a provisional factor is visible but
    // carries no verdict and no q-value, so it cannot enter the BH family and
    // cannot dilute the correction for the ones that earned it.
    for (const finding of findings.filter((f) => f.status === 'provisional')) {
      expect(finding.label).toBeNull();
      expect(finding.qValue).toBeNull();
      expect(finding.pValue).toBeNull();
      expect(finding.rank).toBeNull();
    }
  });
});

describe('autocorrelated noise with multi-week flares', () => {
  it('never produces more than one clear finding per family', () => {
    // The realistic adversarial case: an outcome that drifts for weeks and
    // exposure that arrives in runs. Plenty of apparent alignment, none of it
    // real — and BH is expected to fire on about one family-dataset in ten, so
    // the bound that must hold on EVERY dataset is one, not zero.
    for (const seed of ['ar1-a', 'ar1-b', 'ar1-c', 'ar1-d', 'ar1-e']) {
      const facts = nullFacts(seed, 0.7);
      const { findings } = computeSuspicionRanking(facts, RUN);
      expect(maxClearPerFamily(findings)).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the intervals wide enough to contain zero — INCLUDING provisional ones', () => {
    /*
     * This is the test that guards the lattice problem, and it deliberately
     * covers EVERY row that shows an interval, not just the confirmatory ones.
     *
     * Restricting it to confirmatory rows would have let it pass forever while
     * never looking at the new ones — and those are exactly where the danger
     * was: measured on null data, a one-exposed-day arm excludes zero in 100 %
     * of datasets, because the exposed rate is pinned to a coarse lattice whose
     * nearest point is further from the baseline than the interval is wide.
     *
     * It passes because an interval is now only offered once the arm-support
     * gates hold. If someone loosens that, this fails.
     */
    const facts = nullFacts('ar1-a', 0.7);
    const { findings } = computeSuspicionRanking(facts, RUN);

    const withInterval = findings.filter(
      (f) => f.effect !== null && f.family === 'food_tag'
    );
    const spanning = withInterval.filter(
      (f) =>
        (f.effect as { ciLow: number }).ciLow <= 0 &&
        (f.effect as { ciHigh: number }).ciHigh >= 0
    );

    expect(withInterval.length).toBeGreaterThan(5);
    // A 95 % interval is expected to miss zero about one time in twenty on null
    // data, so this is a proportion rather than a hard "all of them".
    expect(spanning.length / withInterval.length).toBeGreaterThan(0.8);
  });

  it('offers no interval where one arm cannot move the bootstrap', () => {
    // The mechanism, pinned directly: a factor eaten on very few distinct days
    // is shown, with counts, and without an interval. Any interval there would
    // describe the OTHER arm's precision and read as certainty.
    const facts = synthesiseFacts({
      seed: 'thin-arm',
      days: 200,
      tags: [
        {
          key: 'rare',
          window: 'early',
          runStartProbability: 0.004,
          runLength: 1,
          grams: 40,
        },
        ...standardTagSpecs(4),
      ],
    });
    const { findings } = computeSuspicionRanking(facts, RUN);
    const rare = findings.find((f) => f.key === 'rare');

    expect(rare?.status).not.toBe('confirmatory');
    expect(rare?.effect).toBeNull();
    // But the counts are real and are kept.
    expect(rare?.gates.some((g) => !g.passed)).toBe(true);
  });
});

describe('why the block bootstrap exists', () => {
  it('an iid resampler narrows the day-level intervals on data where nothing happens', () => {
    /**
     * This documents the design decision and will catch a future
     * "simplification" that removes the blocking.
     *
     * The demonstration uses DAY-level tags (`next_day`), and that choice is
     * itself informative. In Model B each day feeds exactly one arm, so a
     * multi-week drift in the outcome lands entirely on one side and blocking is
     * what keeps the interval honest.
     *
     * In Model A an exposed day usually contributes to BOTH arms — some meals
     * that day carry the tag and some do not — so a day-level shock largely
     * cancels inside the difference. That makes the meal-level risk difference
     * comparatively robust to autocorrelation, which is worth knowing and is
     * why this test does not use it.
     */
    const dayTags = Array.from({ length: 10 }, (_, i) => ({
      key: `pattern_${i}`,
      window: 'next_day' as const,
      runStartProbability: 0.05 + (i % 4) * 0.01,
      runLength: 6 + (i % 3),
      grams: 40,
    }));

    let blockedTotal = 0;
    let iidTotal = 0;
    let iidNarrower = 0;
    let compared = 0;
    let blockedExcludesZero = 0;
    let iidExcludesZero = 0;

    for (const seed of ['iid-a', 'iid-b', 'iid-c', 'iid-d']) {
      const facts = synthesiseFacts({
        seed,
        days: 365,
        tags: dayTags,
        raBaseline: {
          level: 4,
          ar1: 0.9,
          noiseSd: 1.4,
          flareRate: 0.005,
          flareLengthDays: [12, 28],
        },
      });

      const blocked = computeSuspicionRanking(facts, RUN);
      const iid = computeSuspicionRanking(facts, {
        ...RUN,
        resampler: (n, _blockLength, rng) => iidIndices(n, rng),
      });

      blockedTotal += clearCount(blocked.findings);
      iidTotal += clearCount(iid.findings);

      for (const iidFinding of iid.findings) {
        // Confirmatory only: a provisional row's interval width is set by the
        // arm that HAS data, so mixing them in would dilute the comparison this
        // test exists to make.
        if (iidFinding.status !== 'confirmatory') continue;
        if (iidFinding.family !== 'food_tag' || !iidFinding.effect) continue;
        const blockedFinding = blocked.findings.find((f) => f.key === iidFinding.key);
        if (!blockedFinding?.effect) continue;
        compared++;
        const iidWidth = iidFinding.effect.ciHigh - iidFinding.effect.ciLow;
        const blockedWidth = blockedFinding.effect.ciHigh - blockedFinding.effect.ciLow;
        if (iidWidth < blockedWidth) iidNarrower++;
        if (iidFinding.effect.ciLow > 0 || iidFinding.effect.ciHigh < 0) {
          iidExcludesZero++;
        }
        if (blockedFinding.effect.ciLow > 0 || blockedFinding.effect.ciHigh < 0) {
          blockedExcludesZero++;
        }
      }
    }

    expect(compared).toBeGreaterThan(20);

    // The defect, measured: iid intervals are systematically narrower on a
    // drifting outcome, because independent draws break the dependence they
    // should have preserved.
    expect(iidNarrower / compared).toBeGreaterThan(0.7);

    // The direct consequence: more iid intervals wrongly exclude zero on data
    // where nothing is going on.
    expect(iidExcludesZero).toBeGreaterThan(blockedExcludesZero);

    /**
     * And the reassuring part, which is worth pinning as a property in its own
     * right: neither run produces a `clear` finding, because `clear` needs the
     * q-value too — and that comes from the rotation test, which the resampler
     * cannot touch. A broken bootstrap alone cannot manufacture a discovery.
     * That is defence in depth, not redundancy, and it is the reason the
     * interval and the p-value are computed by two different mechanisms.
     */
    expect(blockedTotal).toBe(0);
    expect(iidTotal).toBe(0);
  });
});
