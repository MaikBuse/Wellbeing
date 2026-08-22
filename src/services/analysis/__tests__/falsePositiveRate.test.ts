import { describe, expect, it } from 'vitest';
import { computeSuspicionRanking } from '@/services/analysis/run';
import { standardTagSpecs, synthesiseFacts } from './synthetic';

/**
 * Calibration of the whole pipeline on pure-noise data.
 *
 * CLAUDE.md asks for exactly this: if the pipeline finds signals in noise,
 * Vitest should say so rather than the diet. Two bounds, and the LOWER one is
 * what turns this from theatre into a real test — a pipeline whose p-values are
 * stuck near 1 rejects nothing and would sail through any upper bound while
 * being completely useless.
 *
 * The full version is behind an env flag because 200 trials at full resample
 * counts is far too slow for `npm test`, which runs inside `pre-deploy`. Both
 * live in this file so nobody forgets the full one exists:
 *
 *     ANALYSIS_FPR_FULL=1 npm run test
 */

type Trial = {
  rawRejections: number;
  testedHypotheses: number;
  clearInFoodTags: boolean;
  clearInConfounders: boolean;
};

function runTrial(index: number, days: number, tagCount: number, resamples: number): Trial {
  const facts = synthesiseFacts({
    seed: `fpr-${index}`,
    days,
    tags: standardTagSpecs(tagCount),
    // No injected effect anywhere: exposure and outcome are independent.
    raBaseline: {
      level: 4,
      ar1: 0.7,
      noiseSd: 1.2,
      flareRate: 0.004,
      flareLengthDays: [10, 25],
    },
    varyConfounders: true,
  });

  const { findings } = computeSuspicionRanking(facts, {
    seed: `fpr-run-${index}`,
    timeZone: 'Europe/Berlin',
    dayStartHour: 4,
    countTraceExposure: false,
    bootstrapResamples: resamples,
    rotationResamples: resamples,
  });

  // Confirmatory only — which is the same set as before, because a p-value now
  // exists only for those. If this ever shrinks toward zero, the
  // `hypotheses > 100` assertion below is the guard that notices.
  const tested = findings.filter(
    (f) => f.status === 'confirmatory' && f.pValue !== null
  );
  return {
    rawRejections: tested.filter((f) => (f.pValue as number) < 0.05).length,
    testedHypotheses: tested.length,
    clearInFoodTags: findings.some(
      (f) => f.label === 'clear' && f.family === 'food_tag'
    ),
    clearInConfounders: findings.some(
      (f) => f.label === 'clear' && f.family === 'confounder'
    ),
  };
}

function summarise(trials: Trial[]) {
  const rejections = trials.reduce((a, t) => a + t.rawRejections, 0);
  const hypotheses = trials.reduce((a, t) => a + t.testedHypotheses, 0);
  return {
    rawRejectionRate: hypotheses === 0 ? 0 : rejections / hypotheses,
    // Per FAMILY, because BH is applied per family. Across both families the
    // combined rate is roughly 1 - (1 - alpha)^2, which is the stated and
    // deliberate cost of not pooling food tags with confounders — pooling would
    // let one strong confounder consume the entire budget and suppress every
    // food finding.
    foodTagClearRate:
      trials.filter((t) => t.clearInFoodTags).length / trials.length,
    confounderClearRate:
      trials.filter((t) => t.clearInConfounders).length / trials.length,
    hypotheses,
  };
}

describe('false-positive rate on pure noise', () => {
  it(
    'keeps the rotation test calibrated and BH inside its budget',
    { timeout: 120_000 },
    () => {
      const trials = Array.from({ length: 40 }, (_, i) => runTrial(i, 240, 12, 400));
      const { rawRejectionRate, foodTagClearRate, confounderClearRate, hypotheses } =
        summarise(trials);

      // Printed so a drift in calibration is visible in CI output, not just a
      // pass/fail.
      console.log(
        `FPR: raw=${rawRejectionRate.toFixed(4)} food=${foodTagClearRate.toFixed(3)} conf=${confounderClearRate.toFixed(3)} hypotheses=${hypotheses}`
      );
      expect(hypotheses).toBeGreaterThan(100);

      // Direct calibration of the rotation test, where a bug would show first.
      // Widened from the full version's bounds to match 40 trials, not 200.
      expect(rawRejectionRate).toBeLessThan(0.12);
      // The bound that matters: a test that never rejects is equally broken.
      expect(rawRejectionRate).toBeGreaterThan(0.005);

      // Under the complete null BH controls P(at least one rejection) at alpha,
      // and it is applied per family.
      expect(foodTagClearRate).toBeLessThan(0.2);
      expect(confounderClearRate).toBeLessThan(0.2);
    }
  );
});

describe.skipIf(!process.env.ANALYSIS_FPR_FULL)(
  'false-positive rate on pure noise (full)',
  () => {
    it(
      'holds at 200 trials and full resample counts',
      { timeout: 3_600_000 },
      () => {
        const trials = Array.from({ length: 200 }, (_, i) =>
          runTrial(i, 365, 20, 2000)
        );
        const { rawRejectionRate, foodTagClearRate, confounderClearRate } =
          summarise(trials);

        console.log(
          `FPR full: raw=${rawRejectionRate.toFixed(4)} food=${foodTagClearRate.toFixed(3)} conf=${confounderClearRate.toFixed(3)}`
        );

        // At p = 0.05 with this many hypotheses the binomial standard error is
        // small, so these are real bounds rather than flake insurance.
        expect(rawRejectionRate).toBeLessThan(0.08);
        expect(rawRejectionRate).toBeGreaterThan(0.02);
        expect(foodTagClearRate).toBeLessThan(0.15);
        expect(confounderClearRate).toBeLessThan(0.15);
      }
    );
  }
);
