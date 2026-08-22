/**
 * DMARD adherence over a trailing window.
 *
 * The one thing that must not be done here is counting `medication_intake`
 * rows. `medication.ts` spells out why: rows are created lazily on tap, so an
 * untouched past dose has NO row and is implicitly missed. Counting rows would
 * compute adherence as ~100 % forever and make the whole variable useless while
 * looking perfectly plausible.
 *
 * So the expected series is regenerated through `expandDueDoses`, the same pure
 * function the UI and the report use.
 */
import { addDays, type LogDate } from '@/lib/time';
import { expandDueDoses, type Schedule } from '@/services/medication/schedule';

/** Disease-modifying categories. NSAIDs and analgesics are symptomatic. */
export const DMARD_CATEGORIES = ['csdmard', 'bdmard', 'tsdmard'] as const;

export const ADHERENCE_WINDOW_DAYS = 7;
export const LOW_ADHERENCE_THRESHOLD = 0.8;

export type AdherenceIntake = {
  logDate: LogDate;
  scheduleDoseId: string | null;
  status: 'taken' | 'skipped' | 'missed';
};

/**
 * Taken / expected over the `windowDays` ending on `day`, inclusive.
 *
 * Returns null when nothing was due in the window — a biologic given every two
 * weeks has genuinely empty weeks, and calling that 0 % adherence would
 * manufacture a confounder out of the dosing interval.
 */
export function adherenceForWindow(
  schedules: Schedule[],
  intakes: readonly AdherenceIntake[],
  day: LogDate,
  windowDays: number = ADHERENCE_WINDOW_DAYS
): number | null {
  const takenDoseIds = new Set(
    intakes
      .filter((i) => i.status === 'taken' && i.scheduleDoseId !== null)
      .map((i) => `${i.logDate}:${i.scheduleDoseId}`)
  );

  let expected = 0;
  let taken = 0;

  for (let offset = windowDays - 1; offset >= 0; offset--) {
    const date = addDays(day, -offset);
    for (const planned of expandDueDoses(schedules, date)) {
      expected++;
      if (takenDoseIds.has(`${date}:${planned.scheduleDoseId}`)) taken++;
    }
  }

  return expected === 0 ? null : taken / expected;
}
