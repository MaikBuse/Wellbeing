/**
 * Which doses are due on a given day.
 *
 * A pure function, no cron and no materialising job: rows in
 * medication_intake are created lazily when a dose is checked off. The same
 * function is used by the UI, by adherence analytics and by the PDF report, so
 * "what should have been taken" has exactly one definition.
 *
 * Consequence to keep in mind: an untouched past dose has NO row and is
 * implicitly missed. Anything counting adherence must regenerate the expected
 * series through here rather than counting rows.
 */
import { daysBetween, weekdayOf, type LogDate } from '@/lib/time';

export type ScheduleDose = {
  id: string;
  timeOfDay: string; // 'HH:MM:SS'
  doseAmount: number;
  doseUnit: string;
  sortOrder: number;
};

export type Schedule = {
  id: string;
  medicationId: string;
  kind: 'daily' | 'weekly' | 'interval_days' | 'as_needed';
  weekday: number | null;
  intervalDays: number | null;
  anchorDate: LogDate | null;
  validFrom: LogDate;
  validTo: LogDate | null;
  doses: ScheduleDose[];
};

export type PlannedDose = {
  medicationId: string;
  scheduleId: string;
  scheduleDoseId: string;
  plannedLogDate: LogDate;
  timeOfDay: string;
  doseAmount: number;
  doseUnit: string;
  sortOrder: number;
};

function isActiveOn(schedule: Schedule, logDate: LogDate): boolean {
  if (daysBetween(schedule.validFrom, logDate) < 0) return false;
  if (schedule.validTo && daysBetween(logDate, schedule.validTo) < 0) {
    return false;
  }
  return true;
}

function isDueOn(schedule: Schedule, logDate: LogDate): boolean {
  switch (schedule.kind) {
    case 'daily':
      return true;
    case 'weekly':
      return (
        schedule.weekday !== null && weekdayOf(logDate) === schedule.weekday
      );
    case 'interval_days': {
      if (!schedule.anchorDate || !schedule.intervalDays) return false;
      const delta = daysBetween(schedule.anchorDate, logDate);
      if (delta < 0) return false;
      return delta % schedule.intervalDays === 0;
    }
    case 'as_needed':
      // Never due; rendered in a separate "Bei Bedarf" section.
      return false;
  }
}

export function expandDueDoses(
  schedules: Schedule[],
  logDate: LogDate
): PlannedDose[] {
  const planned: PlannedDose[] = [];
  for (const schedule of schedules) {
    if (!isActiveOn(schedule, logDate)) continue;
    if (!isDueOn(schedule, logDate)) continue;
    for (const dose of schedule.doses) {
      planned.push({
        medicationId: schedule.medicationId,
        scheduleId: schedule.id,
        scheduleDoseId: dose.id,
        plannedLogDate: logDate,
        timeOfDay: dose.timeOfDay,
        doseAmount: dose.doseAmount,
        doseUnit: dose.doseUnit,
        sortOrder: dose.sortOrder,
      });
    }
  }
  return planned.sort(
    (a, b) =>
      a.timeOfDay.localeCompare(b.timeOfDay) || a.sortOrder - b.sortOrder
  );
}

/** 'HH:MM:SS' -> 'HH:MM' */
export function formatTimeOfDay(timeOfDay: string): string {
  return timeOfDay.slice(0, 5);
}
