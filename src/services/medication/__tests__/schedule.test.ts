import { describe, expect, it } from 'vitest';
import { expandDueDoses, type Schedule } from '../schedule';

function dose(id: string, timeOfDay: string, amount = 10) {
  return {
    id,
    timeOfDay,
    doseAmount: amount,
    doseUnit: 'mg',
    sortOrder: 0,
  };
}

const daily: Schedule = {
  id: 's-daily',
  medicationId: 'm-folic',
  kind: 'daily',
  weekday: null,
  intervalDays: null,
  anchorDate: null,
  validFrom: '2026-08-01',
  validTo: null,
  doses: [dose('d-morning', '08:00:00', 5), dose('d-evening', '20:00:00', 5)],
};

/** MTX weekly, Wednesdays. */
const weekly: Schedule = {
  id: 's-mtx',
  medicationId: 'm-mtx',
  kind: 'weekly',
  weekday: 2,
  intervalDays: null,
  anchorDate: null,
  validFrom: '2026-08-01',
  validTo: null,
  doses: [dose('d-mtx', '19:00:00', 15)],
};

/** Biologic every 14 days. */
const biweekly: Schedule = {
  id: 's-bio',
  medicationId: 'm-bio',
  kind: 'interval_days',
  weekday: null,
  intervalDays: 14,
  anchorDate: '2026-08-05',
  validFrom: '2026-08-01',
  validTo: null,
  doses: [dose('d-bio', '09:00:00', 40)],
};

const asNeeded: Schedule = {
  id: 's-prn',
  medicationId: 'm-ibu',
  kind: 'as_needed',
  weekday: null,
  intervalDays: null,
  anchorDate: null,
  validFrom: '2026-08-01',
  validTo: null,
  doses: [dose('d-ibu', '12:00:00', 400)],
};

describe('expandDueDoses', () => {
  it('returns every daily dose, ordered by time of day', () => {
    const due = expandDueDoses([daily], '2026-08-22');
    expect(due.map((d) => d.scheduleDoseId)).toEqual([
      'd-morning',
      'd-evening',
    ]);
  });

  it('returns a weekly dose only on its weekday', () => {
    // 2026-08-26 is a Wednesday, 2026-08-27 a Thursday.
    expect(expandDueDoses([weekly], '2026-08-26')).toHaveLength(1);
    expect(expandDueDoses([weekly], '2026-08-27')).toHaveLength(0);
  });

  it('returns an interval dose on the anchor and every n days after', () => {
    expect(expandDueDoses([biweekly], '2026-08-05')).toHaveLength(1);
    expect(expandDueDoses([biweekly], '2026-08-19')).toHaveLength(1);
    expect(expandDueDoses([biweekly], '2026-09-02')).toHaveLength(1);
    expect(expandDueDoses([biweekly], '2026-08-12')).toHaveLength(0);
  });

  it('never returns an interval dose before its anchor', () => {
    expect(expandDueDoses([biweekly], '2026-07-22')).toHaveLength(0);
  });

  it('never returns as-needed medication as due', () => {
    expect(expandDueDoses([asNeeded], '2026-08-22')).toHaveLength(0);
  });

  it('respects the validity window, so a dose change is history', () => {
    const tapering: Schedule = {
      ...daily,
      id: 's-old',
      validFrom: '2026-08-01',
      validTo: '2026-08-21',
    };
    expect(expandDueDoses([tapering], '2026-08-21')).toHaveLength(2);
    expect(expandDueDoses([tapering], '2026-08-22')).toHaveLength(0);
  });

  it('does not return a schedule before it starts', () => {
    expect(expandDueDoses([daily], '2026-07-31')).toHaveLength(0);
  });

  it('merges several medications into one time-ordered list', () => {
    const due = expandDueDoses([daily, weekly], '2026-08-26');
    expect(due.map((d) => d.timeOfDay)).toEqual([
      '08:00:00',
      '19:00:00',
      '20:00:00',
    ]);
  });
});
