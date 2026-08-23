import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  EVENING_HOUR,
  instantForLogDateTime,
  isBeforeDayBoundary,
  isEveningIn,
  eachLogDate,
  logDateRange,
  MAX_RANGE_DAYS,
  timeOfDayOf,
  toLogDate,
  weekdayOf,
} from '../time';

const TZ = 'Europe/Berlin';

describe('toLogDate', () => {
  it('keeps a late dinner on the same day', () => {
    // 23:30 local on 2026-08-22 (CEST, UTC+2) => 21:30Z
    expect(toLogDate(new Date('2026-08-22T21:30:00Z'), TZ, 4)).toBe(
      '2026-08-22'
    );
  });

  it('assigns a 01:00 symptom to the previous logical day', () => {
    // 01:00 local on 2026-08-23 => 23:00Z on the 22nd
    expect(toLogDate(new Date('2026-08-22T23:00:00Z'), TZ, 4)).toBe(
      '2026-08-22'
    );
  });

  it('starts the new day at the boundary hour', () => {
    // 03:59 local -> previous day, 04:00 local -> that day
    expect(toLogDate(new Date('2026-08-23T01:59:00Z'), TZ, 4)).toBe(
      '2026-08-22'
    );
    expect(toLogDate(new Date('2026-08-23T02:00:00Z'), TZ, 4)).toBe(
      '2026-08-23'
    );
  });

  it('handles the winter offset', () => {
    // 2026-01-15 00:30 local (CET, UTC+1) => 23:30Z on the 14th
    expect(toLogDate(new Date('2026-01-14T23:30:00Z'), TZ, 4)).toBe(
      '2026-01-14'
    );
  });

  it('crosses a month and a year boundary', () => {
    expect(toLogDate(new Date('2027-01-01T01:00:00Z'), TZ, 4)).toBe(
      '2026-12-31'
    );
  });

  it('respects a dayStartHour of 0', () => {
    expect(toLogDate(new Date('2026-08-22T23:00:00Z'), TZ, 0)).toBe(
      '2026-08-23'
    );
  });
});

describe('logDateRange', () => {
  it('covers 24 hours on an ordinary summer day', () => {
    const { from, to } = logDateRange('2026-08-22', TZ, 4);
    expect(from.toISOString()).toBe('2026-08-22T02:00:00.000Z');
    expect(to.toISOString()).toBe('2026-08-23T02:00:00.000Z');
    expect(to.getTime() - from.getTime()).toBe(24 * 3600 * 1000);
  });

  it('produces a 23 hour day on the spring DST transition', () => {
    // Clocks go forward on 2026-03-29 at 02:00 local.
    const { from, to } = logDateRange('2026-03-28', TZ, 4);
    expect(to.getTime() - from.getTime()).toBe(23 * 3600 * 1000);
  });

  it('produces a 25 hour day on the autumn DST transition', () => {
    // Clocks go back on 2026-10-25 at 03:00 local.
    const { from, to } = logDateRange('2026-10-24', TZ, 4);
    expect(to.getTime() - from.getTime()).toBe(25 * 3600 * 1000);
  });

  it('round-trips every instant in a range back to its log date', () => {
    const logDate = '2026-03-28';
    const { from, to } = logDateRange(logDate, TZ, 4);
    for (let t = from.getTime(); t < to.getTime(); t += 37 * 60 * 1000) {
      expect(toLogDate(new Date(t), TZ, 4)).toBe(logDate);
    }
  });
});

describe('calendar helpers', () => {
  it('adds days across a DST boundary without drifting', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('counts whole days between dates', () => {
    expect(daysBetween('2026-08-22', '2026-08-22')).toBe(0);
    expect(daysBetween('2026-08-22', '2026-09-05')).toBe(14);
    expect(daysBetween('2026-09-05', '2026-08-22')).toBe(-14);
    // Spans the spring transition: still 3 calendar days.
    expect(daysBetween('2026-03-28', '2026-03-31')).toBe(3);
  });

  it('maps weekdays with Monday as 0', () => {
    expect(weekdayOf('2026-08-24')).toBe(0); // Monday
    expect(weekdayOf('2026-08-22')).toBe(5); // Saturday
    expect(weekdayOf('2026-08-23')).toBe(6); // Sunday
  });
});

describe('instantForLogDateTime', () => {
  it('resolves an ordinary afternoon on the same calendar date', () => {
    // 13:30 local on 2026-08-22 (CEST, UTC+2) => 11:30Z
    expect(
      instantForLogDateTime('2026-08-22', '13:30', TZ, 4).toISOString()
    ).toBe('2026-08-22T11:30:00.000Z');
  });

  it('puts a time before the day boundary on the NEXT calendar date', () => {
    // 01:30 on the logical day 2026-08-21 is 2026-08-22 01:30 local = 23:30Z.
    expect(
      instantForLogDateTime('2026-08-21', '01:30', TZ, 4).toISOString()
    ).toBe('2026-08-21T23:30:00.000Z');
  });

  it('keeps the boundary hour itself on its own calendar date', () => {
    expect(
      instantForLogDateTime('2026-08-22', '04:00', TZ, 4).toISOString()
    ).toBe('2026-08-22T02:00:00.000Z');
    expect(
      instantForLogDateTime('2026-08-22', '03:59', TZ, 4).toISOString()
    ).toBe('2026-08-23T01:59:00.000Z');
  });

  it('uses the winter offset in winter', () => {
    // CET is UTC+1.
    expect(
      instantForLogDateTime('2026-01-15', '13:30', TZ, 4).toISOString()
    ).toBe('2026-01-15T12:30:00.000Z');
  });

  it('round-trips back to its log date, DST days included', () => {
    for (const logDate of [
      '2026-03-28',
      '2026-03-29',
      '2026-10-24',
      '2026-10-25',
    ]) {
      for (let hour = 0; hour < 24; hour += 1) {
        for (const minute of ['00', '30']) {
          const time = `${String(hour).padStart(2, '0')}:${minute}`;
          const instant = instantForLogDateTime(logDate, time, TZ, 4);
          expect(toLogDate(instant, TZ, 4)).toBe(logDate);
        }
      }
    }
  });

  it('lands inside the range the same log date covers', () => {
    const logDate = '2026-10-24'; // the 25 hour day
    const { from, to } = logDateRange(logDate, TZ, 4);
    const instant = instantForLogDateTime(logDate, '02:15', TZ, 4);
    expect(instant.getTime()).toBeGreaterThanOrEqual(from.getTime());
    expect(instant.getTime()).toBeLessThan(to.getTime());
  });

  it('rejects a malformed time', () => {
    expect(() => instantForLogDateTime('2026-08-22', '9:00', TZ, 4)).toThrow();
    expect(() => instantForLogDateTime('2026-08-22', '24:00', TZ, 4)).toThrow();
    expect(() => instantForLogDateTime('2026-08-22', '12:60', TZ, 4)).toThrow();
  });
});

describe('timeOfDayOf', () => {
  it('reads back the wall-clock time it was built from', () => {
    for (const time of ['00:15', '04:00', '13:30', '23:59']) {
      const instant = instantForLogDateTime('2026-08-22', time, TZ, 4);
      expect(timeOfDayOf(instant, TZ)).toBe(time);
    }
  });

  it('reports midnight as 00:00, not 24:00', () => {
    expect(timeOfDayOf(new Date('2026-08-21T22:00:00Z'), TZ)).toBe('00:00');
  });
});

describe('isBeforeDayBoundary', () => {
  it('is true between midnight and the boundary hour', () => {
    // 01:00 local on Saturday 2026-08-22 => still the Friday log date.
    const night = new Date('2026-08-21T23:00:00Z');
    expect(isBeforeDayBoundary(TZ, 4, night)).toBe(true);
    expect(toLogDate(night, TZ, 4)).toBe('2026-08-21');
  });

  it('is false the rest of the day', () => {
    expect(isBeforeDayBoundary(TZ, 4, new Date('2026-08-22T02:00:00Z'))).toBe(
      false
    );
    expect(isBeforeDayBoundary(TZ, 4, new Date('2026-08-22T21:30:00Z'))).toBe(
      false
    );
  });

  it('is never true with a day start of midnight', () => {
    expect(isBeforeDayBoundary(TZ, 0, new Date('2026-08-21T23:00:00Z'))).toBe(
      false
    );
  });
});

describe('eachLogDate', () => {
  it('is inclusive at both ends', () => {
    expect(eachLogDate('2026-08-20', '2026-08-22')).toEqual([
      '2026-08-20',
      '2026-08-21',
      '2026-08-22',
    ]);
  });

  it('returns a single day when from equals to', () => {
    expect(eachLogDate('2026-08-22', '2026-08-22')).toEqual(['2026-08-22']);
  });

  it('is dense across a month and a year boundary', () => {
    const across = eachLogDate('2026-12-30', '2027-01-02');
    expect(across).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });

  it('is dense across both DST transitions', () => {
    // The analysis rotates over this index, so a missing or duplicated day
    // would silently shift every exposure against its outcome.
    const spring = eachLogDate('2026-03-27', '2026-03-30');
    expect(spring).toEqual([
      '2026-03-27',
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
    ]);
    const autumn = eachLogDate('2026-10-23', '2026-10-26');
    expect(autumn).toEqual([
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
    ]);
  });

  it('covers a leap day', () => {
    const days = eachLogDate('2028-02-27', '2028-03-01');
    expect(days).toContain('2028-02-29');
    expect(days).toHaveLength(4);
  });

  it('agrees with daysBetween on its own length', () => {
    const days = eachLogDate('2026-01-01', '2026-12-31');
    expect(days).toHaveLength(daysBetween('2026-01-01', '2026-12-31') + 1);
  });

  it('rejects a reversed range rather than returning nothing', () => {
    expect(() => eachLogDate('2026-08-22', '2026-08-20')).toThrow();
  });

  it('rejects a runaway range', () => {
    expect(() => eachLogDate('2000-01-01', '2026-01-01')).toThrow();
    expect(MAX_RANGE_DAYS).toBe(1830);
  });
});

describe('isEveningIn', () => {
  /* 12:00 local on 2026-08-22 (CEST, UTC+2) => 10:00Z. */
  it('is false in the middle of the day', () => {
    expect(isEveningIn(TZ, 4, new Date('2026-08-22T10:00:00Z'))).toBe(false);
  });

  it('flips exactly at the evening hour', () => {
    const before = new Date('2026-08-22T16:59:00Z'); // 18:59 local
    const after = new Date('2026-08-22T17:00:00Z'); // 19:00 local
    expect(EVENING_HOUR).toBe(19);
    expect(isEveningIn(TZ, 4, before)).toBe(false);
    expect(isEveningIn(TZ, 4, after)).toBe(true);
  });

  /*
   * The small hours belong to the previous logical day, and that day is over.
   * A closing line that vanished at midnight would disappear from exactly the
   * screen someone opens when they log a late dinner.
   */
  it('is true before the day boundary, when the logical day is yesterday', () => {
    const night = new Date('2026-08-21T23:00:00Z'); // 01:00 local Saturday
    expect(isBeforeDayBoundary(TZ, 4, night)).toBe(true);
    expect(isEveningIn(TZ, 4, night)).toBe(true);
  });

  it('is false again once the new logical day has started', () => {
    const morning = new Date('2026-08-22T04:00:00Z'); // 06:00 local
    expect(isEveningIn(TZ, 4, morning)).toBe(false);
  });

  it('reads the hour in the user zone, not the server zone', () => {
    // 19:00 in Berlin is 10:00 in Los Angeles: evening there, not here.
    const instant = new Date('2026-08-22T17:00:00Z');
    expect(isEveningIn('Europe/Berlin', 4, instant)).toBe(true);
    expect(isEveningIn('America/Los_Angeles', 4, instant)).toBe(false);
  });
});
