/**
 * Builders for progress tests.
 *
 * Not a test file itself — `synthetic.ts` next to the analysis tests plays the
 * same role there.
 */
import { addDays, type LogDate } from '@/lib/time';
import type { MealSlotKey } from '@/lib/scales';
import type { DayCoverage } from '../types';

export const START: LogDate = '2026-01-01';

/** A day that satisfies the streak rule: one meal plus a daily-log row. */
export function counted(logDate: LogDate): DayCoverage {
  return {
    logDate,
    slots: ['breakfast'],
    hasDailyLog: true,
    coreFilled: 5,
    hasWellbeing: true,
    hasSymptom: false,
  };
}

/** A day with nothing on it. */
export function blank(logDate: LogDate): DayCoverage {
  return {
    logDate,
    slots: [],
    hasDailyLog: false,
    coreFilled: 0,
    hasWellbeing: false,
    hasSymptom: false,
  };
}

export function coverage(
  pattern: string,
  from: LogDate = START
): DayCoverage[] {
  return [...pattern].map((mark, index) => {
    const logDate = addDays(from, index);
    return mark === 'x' ? counted(logDate) : blank(logDate);
  });
}

/** Last day of a pattern that starts at `from`. */
export function lastDay(pattern: string, from: LogDate = START): LogDate {
  return addDays(from, pattern.length - 1);
}

export function withSlots(
  day: DayCoverage,
  slots: MealSlotKey[]
): DayCoverage {
  return { ...day, slots };
}
