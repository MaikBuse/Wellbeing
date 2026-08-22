import { describe, expect, it } from 'vitest';
import {
  BASELINE_MIN_COVERAGE_DAYS,
  MIN_WEIGHT_COVERAGE,
  computeDeviations,
  computeRaIndex,
} from '@/services/analysis/raIndex';
import { stiffnessToScore } from '@/lib/scales';

const full = {
  jointPain: 6,
  tenderCountDas28: 7,
  morningStiffnessMinutes: 30,
  fatigue: 6,
  complaints: 4,
};

describe('computeRaIndex', () => {
  it('weights the five components onto 0-10', () => {
    const { value, coverage } = computeRaIndex(full);
    // 0.3*6 + 0.2*5 + 0.2*6 + 0.15*6 + 0.15*4 = 1.8+1+1.2+0.9+0.6 = 5.5
    expect(coverage).toBeCloseTo(1, 10);
    expect(value).toBeCloseTo(5.5, 10);
  });

  it('is 0 when nothing hurts and 10 when everything does', () => {
    expect(
      computeRaIndex({
        jointPain: 0,
        tenderCountDas28: 0,
        morningStiffnessMinutes: 0,
        fatigue: 0,
        complaints: 0,
      }).value
    ).toBe(0);

    expect(
      computeRaIndex({
        jointPain: 10,
        tenderCountDas28: 14,
        morningStiffnessMinutes: 180,
        fatigue: 10,
        complaints: 10,
      }).value
    ).toBeCloseTo(10, 10);
  });

  it('renormalises over the present components', () => {
    // Only jointPain and stiffness: weights 0.3 and 0.2 renormalise to 0.6/0.4.
    const { value, coverage } = computeRaIndex({
      ...full,
      tenderCountDas28: null,
      fatigue: null,
      complaints: null,
    });
    expect(coverage).toBeCloseTo(0.5, 10);
    // Coverage 0.5 is below the 0.6 floor, so this is refused.
    expect(value).toBeNull();
    expect(coverage).toBeLessThan(MIN_WEIGHT_COVERAGE);
  });

  it('produces a value once coverage clears the floor', () => {
    // jointPain + tenderJoints + stiffness = 0.7.
    const { value, coverage } = computeRaIndex({
      ...full,
      fatigue: null,
      complaints: null,
    });
    expect(coverage).toBeCloseTo(0.7, 10);
    // (0.3*6 + 0.2*5 + 0.2*6) / 0.7 = 4.0 / 0.7
    expect(value).toBeCloseTo(4 / 0.7, 8);
  });

  it('refuses a fatigue-only day, which would otherwise be a different measure', () => {
    // 0.15 + 0.15 renormalised to 1.0 is a fatigue score wearing an RA label.
    const { value } = computeRaIndex({
      jointPain: null,
      tenderCountDas28: null,
      morningStiffnessMinutes: null,
      fatigue: 8,
      complaints: 8,
    });
    expect(value).toBeNull();
  });

  it('refuses a day with no core component even at high coverage', () => {
    // stiffness + fatigue + complaints = 0.5; still no core. Both rules bite.
    const { value } = computeRaIndex({
      jointPain: null,
      tenderCountDas28: null,
      morningStiffnessMinutes: 60,
      fatigue: 10,
      complaints: 10,
    });
    expect(value).toBeNull();
  });

  it('accepts a zero tender count as a real core value', () => {
    // "No joints marked" is information; "no daily_log row" is not. The caller
    // passes null for the second, 0 for the first.
    const { value } = computeRaIndex({
      jointPain: null,
      tenderCountDas28: 0,
      morningStiffnessMinutes: 30,
      fatigue: 6,
      complaints: 4,
    });
    expect(value).not.toBeNull();
  });

  it('returns null, never 0, for a completely empty day', () => {
    const { value } = computeRaIndex({
      jointPain: null,
      tenderCountDas28: null,
      morningStiffnessMinutes: null,
      fatigue: null,
      complaints: null,
    });
    expect(value).toBeNull();
  });

  it('maps the stiffness chips through their anchors', () => {
    expect(stiffnessToScore(0)).toBe(0);
    expect(stiffnessToScore(30)).toBe(6);
    expect(stiffnessToScore(180)).toBe(10);
    expect(stiffnessToScore(400)).toBe(10);
    // Interpolated midpoint between 30->6 and 60->8.
    expect(stiffnessToScore(45)).toBeCloseTo(7, 10);
  });
});

describe('computeDeviations', () => {
  it('is trailing and exclusive, so a spike does not damp itself', () => {
    const series = [4, 4, 4, 4, 4, 4, 4, 10];
    const deviations = computeDeviations(series);
    // Baseline for the last day is the median of the seven 4s, not of 4s+10.
    expect(deviations[7]).toBe(6);
  });

  it('is null until enough prior days are covered', () => {
    const series = [4, 4, 4, 4, 4];
    const deviations = computeDeviations(series);
    expect(deviations[0]).toBeNull();
    // Index 3 has only three prior days covered.
    expect(deviations[BASELINE_MIN_COVERAGE_DAYS - 1]).toBeNull();
    // Index 4 has four, which is the floor.
    expect(deviations[BASELINE_MIN_COVERAGE_DAYS]).toBe(0);
  });

  it('walks calendar days, so a gap yields null rather than a stale baseline', () => {
    // Seven unlogged days then a value: the window holds no covered day.
    const series: (number | null)[] = [
      6, 6, 6, 6, 6,
      null, null, null, null, null, null, null,
      8,
    ];
    const deviations = computeDeviations(series);
    expect(deviations[12]).toBeNull();
  });

  it('keeps flare days in the baseline, which is the point of a deviation', () => {
    // A sustained high level becomes the new normal; only a change shows.
    const flare = [8, 8, 8, 8, 8, 8, 8, 8];
    expect(computeDeviations(flare)[7]).toBe(0);
  });

  it('uses the mean of the two middle values on an even window', () => {
    const series = [0, 2, 8, 10, 4];
    // Baseline for index 4 is median(0,2,8,10) = 5, so 4 - 5 = -1.
    expect(computeDeviations(series)[4]).toBe(-1);
  });

  it('leaves a null day null', () => {
    const series: (number | null)[] = [4, 4, 4, 4, null, 6];
    const deviations = computeDeviations(series);
    expect(deviations[4]).toBeNull();
    expect(deviations[5]).toBe(2);
  });
});
