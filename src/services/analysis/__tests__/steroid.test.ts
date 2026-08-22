import { describe, expect, it } from 'vitest';
import {
  PREDNISOLONE_EQUIVALENT,
  prednisoloneFactor,
  steroidMgForDay,
  steroidStep,
} from '@/services/analysis/steroid';
import type { Schedule } from '@/services/medication/schedule';

const MED = { id: 'm1', name: 'Decortin', activeSubstance: 'Prednisolon' };

function dailySchedule(amount: number, unit = 'mg'): Schedule {
  return {
    id: 's1',
    medicationId: 'm1',
    kind: 'daily',
    weekday: null,
    intervalDays: null,
    anchorDate: null,
    validFrom: '2026-01-01',
    validTo: null,
    doses: [
      { id: 'd1', timeOfDay: '08:00:00', doseAmount: amount, doseUnit: unit, sortOrder: 0 },
    ],
  };
}

const medications = new Map([['m1', MED]]);

describe('prednisoloneFactor', () => {
  it('matches on the active substance', () => {
    expect(prednisoloneFactor(MED)).toEqual({ factor: 1, assumed: false });
  });

  it('converts the stronger steroids', () => {
    expect(
      prednisoloneFactor({ id: 'x', name: 'Fortecortin', activeSubstance: 'Dexamethason' })
        .factor
    ).toBe(6.7);
    expect(
      prednisoloneFactor({ id: 'x', name: 'Celestan', activeSubstance: 'Betamethason' })
        .factor
    ).toBe(8.3);
    expect(
      prednisoloneFactor({ id: 'x', name: 'Hydrocortison', activeSubstance: null }).factor
    ).toBe(0.25);
  });

  it('treats oral budesonide as no systemic dose', () => {
    expect(
      prednisoloneFactor({ id: 'x', name: 'Budenofalk', activeSubstance: 'Budesonid' })
        .factor
    ).toBe(0);
  });

  it('falls back to the trade name when no substance is recorded', () => {
    expect(
      prednisoloneFactor({ id: 'x', name: 'Prednisolon 5mg', activeSubstance: null })
        .assumed
    ).toBe(false);
  });

  it('assumes factor 1 for an unknown substance AND says so', () => {
    // Silently guessing would be worse than the guess itself.
    const result = prednisoloneFactor({
      id: 'x',
      name: 'Irgendwas',
      activeSubstance: 'Unbekanntoid',
    });
    expect(result).toEqual({ factor: 1, assumed: true });
  });

  it('covers every documented equivalence', () => {
    for (const substance of Object.keys(PREDNISOLONE_EQUIVALENT)) {
      const { assumed } = prednisoloneFactor({
        id: 'x',
        name: substance,
        activeSubstance: null,
      });
      expect(assumed).toBe(false);
    }
  });
});

describe('steroidMgForDay', () => {
  it('counts a planned dose with no intake row as taken', () => {
    // A standing steroid dose is not a box she ticks; no row means untouched.
    const result = steroidMgForDay([dailySchedule(5)], medications, [], '2026-06-01');
    expect(result.mg).toBe(5);
    expect(result.factorAssumed).toBe(false);
  });

  it('honours an explicit skip', () => {
    const result = steroidMgForDay(
      [dailySchedule(5)],
      medications,
      [
        {
          medicationId: 'm1',
          scheduleDoseId: 'd1',
          status: 'skipped',
          doseAmount: 5,
          doseUnit: 'mg',
        },
      ],
      '2026-06-01'
    );
    expect(result.mg).toBe(0);
  });

  it('uses the recorded amount over the planned one', () => {
    const result = steroidMgForDay(
      [dailySchedule(5)],
      medications,
      [
        {
          medicationId: 'm1',
          scheduleDoseId: 'd1',
          status: 'taken',
          doseAmount: 2.5,
          doseUnit: 'mg',
        },
      ],
      '2026-06-01'
    );
    expect(result.mg).toBe(2.5);
  });

  it('adds an as-needed rescue dose on top', () => {
    const result = steroidMgForDay(
      [dailySchedule(5)],
      medications,
      [
        {
          medicationId: 'm1',
          scheduleDoseId: null,
          status: 'taken',
          doseAmount: 20,
          doseUnit: 'mg',
        },
      ],
      '2026-06-01'
    );
    expect(result.mg).toBe(25);
  });

  it('applies the equivalence factor', () => {
    const dexa = new Map([
      ['m1', { id: 'm1', name: 'Fortecortin', activeSubstance: 'Dexamethason' }],
    ]);
    const result = steroidMgForDay([dailySchedule(1)], dexa, [], '2026-06-01');
    expect(result.mg).toBeCloseTo(6.7, 10);
  });

  it('cannot convert a non-mg unit and says so instead of guessing', () => {
    const result = steroidMgForDay([dailySchedule(2, 'ml')], medications, [], '2026-06-01');
    expect(result.mg).toBe(0);
    expect(result.factorAssumed).toBe(true);
  });

  it('respects the schedule validity window, so a taper is history', () => {
    const closed: Schedule = { ...dailySchedule(10), validTo: '2026-05-31' };
    const current = { ...dailySchedule(5), id: 's2', validFrom: '2026-06-01' };

    const may = steroidMgForDay([closed, current], medications, [], '2026-05-15');
    const june = steroidMgForDay([closed, current], medications, [], '2026-06-15');
    expect(may.mg).toBe(10);
    expect(june.mg).toBe(5);
  });
});

describe('steroidStep', () => {
  it('buckets on the pre-registered boundaries', () => {
    expect(steroidStep(null)).toBe('none');
    expect(steroidStep(0)).toBe('none');
    expect(steroidStep(2.5)).toBe('low');
    expect(steroidStep(5)).toBe('low');
    expect(steroidStep(7.5)).toBe('medium');
    expect(steroidStep(10)).toBe('medium');
    expect(steroidStep(20)).toBe('high');
  });
});
