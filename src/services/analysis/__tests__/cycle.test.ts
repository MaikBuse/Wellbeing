import { describe, expect, it } from 'vitest';
import {
  MAX_CYCLE_DAYS,
  deriveCyclePhases,
  isPerimenstrual,
  medianCycleLength,
  type MenstrualEvent,
} from '@/services/analysis/cycle';
import { eachLogDate } from '@/lib/time';

const start = (eventDate: string): MenstrualEvent => ({ eventDate, kind: 'period_start' });
const end = (eventDate: string): MenstrualEvent => ({ eventDate, kind: 'period_end' });

describe('medianCycleLength', () => {
  it('defaults to 28 when fewer than two starts are known', () => {
    expect(medianCycleLength([])).toBe(28);
    expect(medianCycleLength([start('2026-01-01')])).toBe(28);
  });

  it('takes the median of the observed gaps', () => {
    const events = [
      start('2026-01-01'),
      start('2026-01-31'),
      start('2026-03-02'),
    ];
    expect(medianCycleLength(events)).toBe(30);
  });

  it('ignores a gap that is too short to be a cycle', () => {
    // A period_start recorded twice in a week is a correction, not a 4-day
    // cycle. The 4-day gap is dropped; the surviving 24-day gap is kept, so the
    // estimate is slightly short. That residual error is not fixable without
    // deciding which of the two starts was the spurious one, and a 24-day
    // estimate is far better than letting a 4 into the median.
    const events = [start('2026-01-01'), start('2026-01-05'), start('2026-01-29')];
    expect(medianCycleLength(events)).toBe(24);
  });

  it('ignores a logging break rather than calling it a 90-day cycle', () => {
    const events = [start('2026-01-01'), start('2026-04-01')];
    expect(medianCycleLength(events)).toBe(28);
  });
});

describe('deriveCyclePhases', () => {
  it('counts day 1 from the period start', () => {
    const days = eachLogDate('2026-01-01', '2026-01-05');
    const phases = deriveCyclePhases([start('2026-01-01')], days);
    expect(phases[0].cycleDay).toBe(1);
    expect(phases[4].cycleDay).toBe(5);
  });

  it('is unknown before any recorded start', () => {
    const days = eachLogDate('2026-01-01', '2026-01-03');
    const phases = deriveCyclePhases([start('2026-02-01')], days);
    expect(phases.every((p) => p.phase === 'unknown')).toBe(true);
    expect(phases[0].cycleDay).toBeNull();
  });

  it('goes unknown again once the last start is stale', () => {
    // Otherwise a single start from March would label every day in June.
    const days = eachLogDate('2026-01-01', '2026-03-01');
    const phases = deriveCyclePhases([start('2026-01-01')], days);
    expect(phases[0].phase).toBe('menstrual');
    const stale = phases[phases.length - 1];
    expect(stale.phase).toBe('unknown');
    expect(stale.cycleDay).toBeNull();
    expect(MAX_CYCLE_DAYS).toBe(45);
  });

  it('prefers a recorded period_end over the five-day assumption', () => {
    const days = eachLogDate('2026-01-01', '2026-01-06');
    const phases = deriveCyclePhases([start('2026-01-01'), end('2026-01-02')], days);
    expect(phases[0].phase).toBe('menstrual');
    expect(phases[1].phase).toBe('menstrual');
    // Day 3 is already past the recorded end.
    expect(phases[2].phase).toBe('follicular');
  });

  it('restarts the count on the next period', () => {
    const days = eachLogDate('2026-01-01', '2026-02-05');
    const phases = deriveCyclePhases([start('2026-01-01'), start('2026-01-29')], days);
    const jan29 = days.indexOf('2026-01-29');
    expect(phases[jan29].cycleDay).toBe(1);
    expect(phases[jan29].phase).toBe('menstrual');
  });

  it('splits follicular from luteal at the nominal midpoint', () => {
    const days = eachLogDate('2026-01-01', '2026-01-28');
    const phases = deriveCyclePhases(
      [start('2026-01-01'), start('2026-01-29')],
      days
    );
    expect(phases[days.indexOf('2026-01-10')].phase).toBe('follicular');
    expect(phases[days.indexOf('2026-01-20')].phase).toBe('luteal');
  });
});

describe('isPerimenstrual', () => {
  it('covers the first days and the run-up to the next period', () => {
    expect(isPerimenstrual({ cycleDay: 1, phase: 'menstrual' }, 28)).toBe(true);
    expect(isPerimenstrual({ cycleDay: 3, phase: 'menstrual' }, 28)).toBe(true);
    expect(isPerimenstrual({ cycleDay: 26, phase: 'luteal' }, 28)).toBe(true);
    expect(isPerimenstrual({ cycleDay: 14, phase: 'luteal' }, 28)).toBe(false);
  });

  it('is null, not false, when the cycle day is unknown', () => {
    // An unknown day must be dropped, not counted as unexposed.
    expect(isPerimenstrual({ cycleDay: null, phase: 'unknown' }, 28)).toBeNull();
  });
});
