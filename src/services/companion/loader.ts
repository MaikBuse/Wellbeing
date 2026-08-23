import { dailyLogRange } from '@/db/queries/analysis';
import { activeSchedules, intakesForDay } from '@/db/queries/medication';
import { loggedDayCount } from '@/db/queries/day';
import { mealSlotDays, symptomDays } from '@/db/queries/progress';
import { nutrientDenseOwnFoods, DENSE_FOOD_WINDOW_DAYS } from '@/db/queries/nutrition';
import { addDays, instantForLogDateTime, isEveningIn, type LogDate } from '@/lib/time';
import type { UserSettings } from '@/db/queries/users';
import { expandDueDoses, formatTimeOfDay } from '@/services/medication/schedule';
import { dayCompleteness } from '@/services/progress/completeness';
import { buildCoverage } from '@/services/progress/loader';
import { DAY_PRIORITY, dayNutrition } from '@/services/nutrition/loader';
import {
  mascotBond,
  mascotMoodForDay,
  type MascotBond,
  type MascotState,
} from '@/services/nutrition/mascot';
import { rankNextStep, type NextStep } from '@/services/nutrition/next-step';
import { companionAgenda, type CompanionAgenda, type DoseTally } from './agenda';

/**
 * The one impure file of this folder, in the arrangement `services/progress`
 * and `services/analysis` already use.
 *
 * It reads TODAY and only today, on every route, because the companion is a
 * companion rather than part of the day screen. That is affordable only because
 * of what it does NOT call: not `loadProgress`, which rebuilds ninety days of
 * due doses to answer a question about one, and not a second nutrient read —
 * `dayNutrition` is the cached entry point, so the day screen and this share a
 * single ninety-day read within a request.
 *
 * Everything it returns is plain data. Every verdict in it was made elsewhere.
 */

export type CompanionData = {
  logDate: LogDate;
  state: MascotState;
  step: NextStep | null;
  bond: MascotBond;
  agenda: CompanionAgenda;
  /**
   * Counters the dock's client island watches for change, so that recording a
   * meal draws a reaction without a single form having to announce it. Numbers
   * only — see the note on health data in `mascot-canvas.tsx`.
   */
  pulse: {
    /**
     * Grams recorded today, rounded.
     *
     * Grams rather than a count of meals, because the count of MEALS does not
     * move when a second item goes into a slot that already had one — and
     * adding a banana to a breakfast that exists is the commonest logging
     * action in the app. This number moves for every one of them, and it is
     * already loaded.
     */
    foodGrams: number;
    dosesAnswered: number;
    /** Zero means the day's doses are all answered, which is the celebration. */
    dosesOpen: number;
    dayLogSaved: boolean;
  };
};

export async function loadCompanion(
  userId: string,
  today: LogDate,
  settings: UserSettings,
  now: Date = new Date()
): Promise<CompanionData> {
  const [nutrition, loggedDays, slotRows, symptomRows, logRows, schedules, intakes] =
    await Promise.all([
      dayNutrition(userId, today),
      loggedDayCount(userId),
      mealSlotDays(userId, today, today),
      symptomDays(userId, today, today),
      dailyLogRange(userId, today, today),
      activeSchedules(userId, today),
      intakesForDay(userId, today),
    ]);

  /*
   * A state even when there is nothing to say.
   *
   * `mascotMoodForDay` answers 'kein_profil', 'schub' and 'zu_wenig_erfasst'
   * with a sentence of their own, so passing the blocked case through gives the
   * figure something honest to say instead of hiding it.
   */
  const state = mascotMoodForDay({
    day: nutrition.today_,
    blocked: nutrition.blocked,
    priority: DAY_PRIORITY,
  });

  const step =
    state.focus?.kind === 'gap'
      ? rankNextStep(
          state.focus,
          await nutrientDenseOwnFoods(userId, state.focus.key, {
            sinceLogDate: addDays(today, -DENSE_FOOD_WINDOW_DAYS),
          })
        )
      : null;

  const doses = tallyDoses(schedules.schedules, intakes, today, settings, now);

  const coverage = buildCoverage(today, today, slotRows, symptomRows, logRows)[0];
  const completeness = dayCompleteness(coverage, {
    due: doses.due,
    answered: doses.answered,
  });

  return {
    logDate: today,
    state,
    step,
    bond: mascotBond(loggedDays),
    agenda: companionAgenda({
      mascot: state,
      doses,
      completeness,
      isEvening: isEveningIn(settings.timeZone, settings.dayStartHour, now),
    }),
    pulse: {
      foodGrams: Math.round(nutrition.raw.at(-1)?.totalGrams ?? 0),
      dosesAnswered: doses.answered,
      dosesOpen: doses.open,
      dayLogSaved: coverage.hasDailyLog,
    },
  };
}

/**
 * Due, answered and actually overdue.
 *
 * "Answered" is taken OR skipped, the same reading `buildDoses` uses in
 * `services/progress/loader.ts`: a deliberate skip is a recorded decision.
 *
 * "Overdue" needs a clock, which is why it is computed here and not in
 * `agenda.ts`. The comparison goes through `instantForLogDateTime` rather than
 * comparing 'HH:MM' strings, because the logical day may start at 04:00 and a
 * dose planned for 01:00 then belongs to the following calendar date — a string
 * compare would call it overdue from the moment the day opened.
 */
function tallyDoses(
  schedules: Parameters<typeof expandDueDoses>[0],
  intakes: readonly { scheduleDoseId: string | null; status: string }[],
  today: LogDate,
  settings: UserSettings,
  now: Date
): DoseTally {
  const answeredIds = new Set(
    intakes
      .filter(
        (intake) =>
          intake.scheduleDoseId !== null &&
          (intake.status === 'taken' || intake.status === 'skipped')
      )
      .map((intake) => intake.scheduleDoseId as string)
  );

  let due = 0;
  let answered = 0;
  let overdue = 0;
  for (const planned of expandDueDoses(schedules, today)) {
    due++;
    if (answeredIds.has(planned.scheduleDoseId)) {
      answered++;
      continue;
    }
    const at = instantForLogDateTime(
      today,
      formatTimeOfDay(planned.timeOfDay),
      settings.timeZone,
      settings.dayStartHour
    );
    if (at.getTime() <= now.getTime()) overdue++;
  }

  return { due, answered, open: due - answered, overdue };
}
