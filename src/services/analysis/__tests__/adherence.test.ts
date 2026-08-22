import { describe, expect, it } from 'vitest';
import { adherenceForWindow } from '@/services/analysis/adherence';
import type { Schedule } from '@/services/medication/schedule';

const daily: Schedule = {
  id: 's1',
  medicationId: 'm1',
  kind: 'daily',
  weekday: null,
  intervalDays: null,
  anchorDate: null,
  validFrom: '2026-01-01',
  validTo: null,
  doses: [
    { id: 'd1', timeOfDay: '08:00:00', doseAmount: 15, doseUnit: 'mg', sortOrder: 0 },
  ],
};

const fortnightly: Schedule = {
  ...daily,
  id: 's2',
  kind: 'interval_days',
  intervalDays: 14,
  anchorDate: '2026-01-01',
};

describe('adherenceForWindow', () => {
  it('counts an untouched past dose as missed', () => {
    // The whole reason this regenerates the expected series: an untouched dose
    // has NO medication_intake row, so counting rows would report 100 % for a
    // week in which nothing was taken.
    expect(adherenceForWindow([daily], [], '2026-06-10')).toBe(0);
  });

  it('is 1 when every due dose was ticked', () => {
    const intakes = Array.from({ length: 7 }, (_, i) => ({
      logDate: `2026-06-${String(4 + i).padStart(2, '0')}`,
      scheduleDoseId: 'd1',
      status: 'taken' as const,
    }));
    expect(adherenceForWindow([daily], intakes, '2026-06-10')).toBe(1);
  });

  it('is a proportion in between', () => {
    const intakes = [
      { logDate: '2026-06-08', scheduleDoseId: 'd1', status: 'taken' as const },
      { logDate: '2026-06-09', scheduleDoseId: 'd1', status: 'taken' as const },
    ];
    expect(adherenceForWindow([daily], intakes, '2026-06-10')).toBeCloseTo(2 / 7, 10);
  });

  it('does not credit a skipped dose', () => {
    const intakes = [
      { logDate: '2026-06-10', scheduleDoseId: 'd1', status: 'skipped' as const },
    ];
    expect(adherenceForWindow([daily], intakes, '2026-06-10')).toBe(0);
  });

  it('does not credit an intake on a different day', () => {
    const intakes = [
      { logDate: '2026-05-01', scheduleDoseId: 'd1', status: 'taken' as const },
    ];
    expect(adherenceForWindow([daily], intakes, '2026-06-10')).toBe(0);
  });

  it('is null when nothing was due, not 0', () => {
    // A biologic given every two weeks has genuinely empty weeks. Calling those
    // 0 % adherence would manufacture a confounder out of the dosing interval.
    const result = adherenceForWindow([fortnightly], [], '2026-01-10');
    expect(result).toBeNull();
  });

  it('respects the schedule validity window', () => {
    const closed: Schedule = { ...daily, validTo: '2026-05-01' };
    expect(adherenceForWindow([closed], [], '2026-06-10')).toBeNull();
  });

  it('honours a custom window length', () => {
    const intakes = [
      { logDate: '2026-06-10', scheduleDoseId: 'd1', status: 'taken' as const },
    ];
    expect(adherenceForWindow([daily], intakes, '2026-06-10', 1)).toBe(1);
  });
});
