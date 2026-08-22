import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  logDateRange,
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
