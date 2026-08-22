import { describe, expect, it } from 'vitest';
import { computeSuspicionRanking } from '@/services/analysis/run';
import { standardTagSpecs, synthesiseFacts } from './synthetic';

const RUN = {
  seed: 'injected',
  timeZone: 'Europe/Berlin',
  dayStartHour: 4,
  countTraceExposure: false,
  bootstrapResamples: 500,
  rotationResamples: 500,
};

describe('an injected meal-reaction effect', () => {
  const facts = synthesiseFacts({
    seed: 'injected-meal',
    days: 365,
    tags: standardTagSpecs(12),
    injected: [{ tagKey: 'tag_0', model: 'meal_reaction', effect: 0.25 }],
  });
  const { findings } = computeSuspicionRanking(facts, RUN);
  const target = findings.find((f) => f.key === 'tag_0');

  it('is found and called a clear connection', () => {
    expect(target?.status).toBe('tested');
    expect(target?.label).toBe('clear');
  });

  it('recovers an effect of the right sign and magnitude', () => {
    // The injected excess is +25 percentage points. The recovered estimate runs
    // somewhat higher because overlapping windows let one symptom count for
    // more than one meal — that is a property of time-based attribution, not a
    // defect, so the band is generous on the upper side rather than exact.
    expect(target?.effect?.point).toBeGreaterThan(15);
    expect(target?.effect?.point).toBeLessThan(55);
  });

  it('reports an interval that excludes zero', () => {
    expect(target?.effect?.ciLow).toBeGreaterThan(0);
  });

  it('ranks it first among the meal-reaction findings', () => {
    expect(target?.rank).toBe(1);
  });

  it('leaves the other eleven tags almost entirely quiet', () => {
    // Not "exactly zero": with BH at 0.10 over a dozen tags the occasional
    // single hit is the procedure working as designed, and demanding zero would
    // be demanding a bug.
    const others = findings.filter(
      (f) => f.family === 'food_tag' && f.key !== 'tag_0' && f.label === 'clear'
    );
    expect(others.length).toBeLessThanOrEqual(1);
  });

  it('carries the counts that make the claim checkable', () => {
    expect(target?.exposed.n).toBeGreaterThan(0);
    expect(target?.unexposed.n).toBeGreaterThan(0);
    expect(target?.exposed.notable).not.toBeNull();
  });
});

describe('an injected next-day RA effect', () => {
  const facts = synthesiseFacts({
    seed: 'injected-day',
    days: 400,
    tags: [
      {
        key: 'omega3',
        window: 'next_day',
        runStartProbability: 0.05,
        runLength: 5,
        grams: 40,
      },
      ...standardTagSpecs(6),
    ],
    injected: [{ tagKey: 'omega3', model: 'ra_next_day', effect: 2.5 }],
  });
  const { findings } = computeSuspicionRanking(facts, RUN);
  const target = findings.find((f) => f.key === 'omega3');

  it('is found on the day model, in index points', () => {
    expect(target?.model).toBe('ra_next_day');
    expect(target?.effect?.kind).toBe('mean_index_points');
    expect(target?.status).toBe('tested');
  });

  it('recovers the sign and a plausible magnitude', () => {
    expect(target?.effect?.point).toBeGreaterThan(0.5);
    expect(target?.effect?.point).toBeLessThan(4);
  });

  it('clears the false-discovery threshold', () => {
    expect(target?.qValue).not.toBeNull();
    expect(target?.qValue as number).toBeLessThanOrEqual(0.1);
  });
});

describe('the trailing-median baseline attenuates a sustained effect', () => {
  /**
   * This is a real and intended property, not a defect, and it is pinned here
   * so nobody "fixes" it later: when exposure comes in runs, the elevated days
   * raise their OWN subsequent baseline, so part of the effect is absorbed. The
   * same effect spread over isolated days is recovered almost in full.
   *
   * It is also the honest reason a next-day nutrient pattern is harder to call
   * than a meal-level trigger: a habit that lasts a week partly becomes the new
   * normal by construction.
   */
  function pointFor(runLength: number, runStartProbability: number): number {
    const facts = synthesiseFacts({
      seed: 'attenuation',
      days: 400,
      tags: [
        { key: 'omega3', window: 'next_day', runStartProbability, runLength, grams: 40 },
        ...standardTagSpecs(6),
      ],
      injected: [{ tagKey: 'omega3', model: 'ra_next_day', effect: 4 }],
    });
    const { findings } = computeSuspicionRanking(facts, RUN);
    return findings.find((f) => f.key === 'omega3')?.effect?.point ?? 0;
  }

  it('recovers less from clustered exposure than from scattered exposure', () => {
    const clustered = pointFor(5, 0.05);
    const scattered = pointFor(1, 0.3);

    expect(clustered).toBeGreaterThan(0);
    expect(scattered).toBeGreaterThan(clustered);
    // Scattered days keep most of the injected 4 points; clustered runs lose a
    // sizeable share of it to their own baseline.
    expect(scattered).toBeGreaterThan(3);
    expect(clustered).toBeLessThan(3.2);
  });
});

describe('the pre-declared window is load-bearing', () => {
  it('does not recover an effect placed in the wrong window', () => {
    // The effect is injected into `late`-window symptoms, but the tag has
    // pre-committed to `immediate`. If this were recovered anyway, the window
    // would be decoration and the whole anti-multiplicity argument would be a
    // fiction.
    const facts = synthesiseFacts({
      seed: 'wrong-window',
      days: 365,
      tags: [
        {
          key: 'mismatch',
          window: 'immediate',
          runStartProbability: 0.06,
          runLength: 5,
          grams: 40,
        },
        ...standardTagSpecs(6),
      ],
      injected: [{ tagKey: 'mismatch', model: 'ra_next_day', effect: 2 }],
    });
    const { findings } = computeSuspicionRanking(facts, RUN);
    const target = findings.find((f) => f.key === 'mismatch');
    expect(target?.label).not.toBe('clear');
  });
});

describe('a real effect on too little data', () => {
  it('lands in "not yet", not in a confident null', () => {
    // The failure mode this guards against: an under-powered tag reporting a
    // tight interval around zero, which reads as "ruled out" when it is really
    // "never looked at".
    const facts = synthesiseFacts({
      seed: 'thin',
      days: 120,
      tags: [
        {
          key: 'rare',
          window: 'early',
          // Very few exposure runs, so the distinct-days gate must bite.
          runStartProbability: 0.006,
          runLength: 2,
          grams: 40,
        },
        ...standardTagSpecs(4),
      ],
      injected: [{ tagKey: 'rare', model: 'meal_reaction', effect: 0.4 }],
    });
    const { findings } = computeSuspicionRanking(facts, RUN);
    const target = findings.find((f) => f.key === 'rare');

    expect(target?.status).toBe('not_yet');
    expect(target?.label).toBe('not_yet');
    expect(target?.effect).toBeNull();
    // And it says what is missing, so she knows what to record more of.
    expect(target?.gates.some((g) => !g.passed)).toBe(true);
  });
});

describe('an injected confounder effect', () => {
  it('recovers a short-sleep effect on the next day', () => {
    const facts = synthesiseFacts({
      seed: 'sleep',
      days: 400,
      tags: standardTagSpecs(6),
      varyConfounders: true,
      sleepEffect: 1.2,
    });
    const { findings } = computeSuspicionRanking(facts, RUN);
    const target = findings.find((f) => f.key === 'sleep_short');

    expect(target?.family).toBe('confounder');
    expect(target?.status).toBe('tested');
    expect(target?.label).toBe('clear');
    expect(target?.effect?.point).toBeGreaterThan(0.3);
  });

  it('leaves an unaffected confounder quiet', () => {
    const facts = synthesiseFacts({
      seed: 'sleep',
      days: 400,
      tags: standardTagSpecs(6),
      varyConfounders: true,
      sleepEffect: 1.2,
    });
    const { findings } = computeSuspicionRanking(facts, RUN);
    const stress = findings.find((f) => f.key === 'stress_high');
    expect(stress?.label).not.toBe('clear');
  });
});
