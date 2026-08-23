/**
 * The one impure file in this folder — same arrangement as
 * `services/analysis/loader.ts`. Everything it calls is pure; everything it
 * returns is plain data a server component can render.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { achievements } from '@/db/schema';
import {
  dailyLogRange,
  intakeRange,
  scheduleVersionsRange,
} from '@/db/queries/analysis';
import type { MedCategory } from '@/db/queries/analysis';
import {
  firstActivityLogDate,
  mealSlotDays,
  symptomDays,
} from '@/db/queries/progress';
import { countCoreDailyFields, type MealSlotKey } from '@/lib/scales';
import { addDays, daysBetween, eachLogDate, type LogDate } from '@/lib/time';
import { computeRaIndex } from '@/services/analysis/raIndex';
import { expandDueDoses } from '@/services/medication/schedule';
import { dayCompleteness, emptyCoverage } from './completeness';
import {
  NO_NUTRITION,
  evaluateMilestones,
  type Milestone,
  type MilestoneKey,
  type NutritionMilestoneInput,
} from './milestones';
import { computeStreak } from './streak';
import type {
  DayCompleteness,
  DayCoverage,
  DayDoses,
  StreakResult,
} from './types';

/**
 * How far back completeness is evaluated.
 *
 * The streak walks the whole history — it is three cheap index reads and a loop
 * over strings. Completeness cannot: its medication block regenerates the due
 * series per day through `expandDueDoses`, and doing that for five years on
 * every page load would be silly for a number nobody looks at that far back.
 * Ninety days covers the weekly review, the thirty-day averages and both
 * run-based milestones with room to spare.
 */
export const COMPLETENESS_WINDOW_DAYS = 90;

/** Every category — a due dose is a due dose, whatever it treats. */
const ALL_MED_CATEGORIES: MedCategory[] = [
  'csdmard',
  'bdmard',
  'tsdmard',
  'nsaid',
  'steroid',
  'analgesic',
  'supplement',
  'other',
];

export type ProgressData = {
  today: LogDate;
  streak: StreakResult;
  todayCompleteness: DayCompleteness;
  /** The completeness window, oldest first, one entry per calendar day. */
  window: DayCompleteness[];
  milestones: Milestone[];
  /**
   * Reached but never acknowledged. The day screen celebrates the first of
   * these once; dismissing it writes the `achievement` row.
   */
  pending: Milestone[];
  acknowledgedOn: Map<MilestoneKey, LogDate>;
};

/**
 * `today` is passed in rather than derived here: the logical day depends on the
 * user's time zone and day-start hour, the caller already resolved it, and
 * computing it twice risks the two disagreeing across the 04:00 boundary.
 */
export async function loadProgress(
  userId: string,
  today: LogDate,
  /*
   * The nutrient milestones' input, supplied by the caller.
   *
   * Passed in rather than loaded here so this file keeps knowing nothing about
   * `services/nutrition` — progress consumes domain services, it does not reach
   * into them, and the day screen already loads the nutrient data for its own
   * widget. Defaults to "not active", which reports both milestones as
   * inapplicable rather than as unreached.
   *
   * A promise is accepted so the caller can start that read in the same
   * `Promise.all` as this one: it is only needed at the very end, right before
   * the milestones are evaluated.
   */
  nutrition:
    | NutritionMilestoneInput
    | Promise<NutritionMilestoneInput> = NO_NUTRITION
): Promise<ProgressData> {
  // A brand-new account starts today rather than at some arbitrary date, so it
  // opens on one open day instead of a wall of missed ones.
  //
  // Clamped to today as well: `/day/[date]` accepts any date in its path, so a
  // row dated in the future is reachable, and `eachLogDate` throws outright on
  // a range that ends before it starts. A stray future entry must not take the
  // whole screen down with it.
  const first = await firstActivityLogDate(userId);
  const from = first === null ? today : minLogDate(first, today);
  const windowFrom = maxLogDate(
    from,
    addDays(today, -(COMPLETENESS_WINDOW_DAYS - 1))
  );

  const [slotRows, symptomRows, logRows, schedules, intakes, ackRows] =
    await Promise.all([
      mealSlotDays(userId, from, today),
      symptomDays(userId, from, today),
      dailyLogRange(userId, from, today),
      scheduleVersionsRange(userId, windowFrom, today, ALL_MED_CATEGORIES),
      intakeRange(userId, windowFrom, today),
      db
        .select({
          key: achievements.key,
          achievedOn: achievements.achievedOn,
        })
        .from(achievements)
        .where(eq(achievements.userId, userId)),
    ]);

  const coverage = buildCoverage(from, today, slotRows, symptomRows, logRows);
  const streak = computeStreak(coverage, from, today);

  const coverageByDate = new Map(coverage.map((day) => [day.logDate, day]));
  const doses = buildDoses(schedules, intakes, windowFrom, today);

  const window = eachLogDate(windowFrom, today).map((logDate) =>
    dayCompleteness(
      coverageByDate.get(logDate) ?? emptyCoverage(logDate),
      doses.get(logDate) ?? { due: 0, answered: 0 }
    )
  );
  const todayCompleteness = window[window.length - 1];

  // The RA day value is what GLOBAL_GATES.daysWithRaIndex counts, so it is
  // computed with the same function the analysis uses rather than re-derived.
  const raIndexDays = logRows
    .filter(
      (row) =>
        computeRaIndex({
          jointPain: row.jointPain,
          tenderCountDas28: row.tenderCountDas28,
          morningStiffnessMinutes: row.morningStiffnessMinutes,
          fatigue: row.fatigue,
          complaints: row.wellbeing,
        }).value !== null
    )
    .map((row) => row.logDate);

  const milestones = evaluateMilestones({
    streak,
    completeness: window,
    doses,
    raIndexDays,
    nutrition: await nutrition,
  });

  const acknowledgedOn = new Map<MilestoneKey, LogDate>(
    ackRows.map((row) => [row.key as MilestoneKey, row.achievedOn])
  );

  const pending = milestones.filter(
    (milestone) =>
      milestone.applicable &&
      milestone.achievedOn !== null &&
      !acknowledgedOn.has(milestone.key)
  );

  return {
    today,
    streak,
    todayCompleteness,
    window,
    milestones,
    pending,
    acknowledgedOn,
  };
}

/**
 * One `DayCoverage` per calendar day in the range, gaps included.
 *
 * The dense calendar is not a convenience here, it is the measurement: a streak
 * is precisely the difference between "days in a row" and "rows in a row".
 */
function buildCoverage(
  from: LogDate,
  to: LogDate,
  slotRows: readonly { logDate: LogDate; slot: MealSlotKey }[],
  symptomRows: readonly LogDate[],
  logRows: readonly {
    logDate: LogDate;
    jointPain: number | null;
    morningStiffnessMinutes: number | null;
    fatigue: number | null;
    sleepQuality: number | null;
    stress: number | null;
    wellbeing: number | null;
  }[]
): DayCoverage[] {
  const slotsByDate = new Map<LogDate, MealSlotKey[]>();
  for (const row of slotRows) {
    const list = slotsByDate.get(row.logDate) ?? [];
    list.push(row.slot);
    slotsByDate.set(row.logDate, list);
  }

  const symptomSet = new Set(symptomRows);
  const logByDate = new Map(logRows.map((row) => [row.logDate, row]));

  return eachLogDate(from, to).map((logDate) => {
    const log = logByDate.get(logDate);
    return {
      logDate,
      slots: slotsByDate.get(logDate) ?? [],
      hasDailyLog: log !== undefined,
      coreFilled: log ? countCoreDailyFields(log) : 0,
      hasWellbeing: log?.wellbeing != null,
      hasSymptom: symptomSet.has(logDate),
    };
  });
}

/**
 * Due and answered doses per day, rebuilt from the schedules.
 *
 * "Answered" is taken OR skipped: a deliberate skip is a recorded decision and
 * the app should not punish it. What it is not is an untouched dose — those
 * have no row at all, which is exactly why this cannot be a `count(*)`.
 */
function buildDoses(
  schedules: Parameters<typeof expandDueDoses>[0],
  intakes: readonly {
    logDate: LogDate;
    scheduleDoseId: string | null;
    status: 'taken' | 'skipped' | 'missed';
  }[],
  from: LogDate,
  to: LogDate
): Map<LogDate, DayDoses> {
  const answeredIds = new Set(
    intakes
      .filter(
        (intake) =>
          intake.scheduleDoseId !== null &&
          (intake.status === 'taken' || intake.status === 'skipped')
      )
      .map((intake) => `${intake.logDate}:${intake.scheduleDoseId}`)
  );

  const byDate = new Map<LogDate, DayDoses>();
  for (const logDate of eachLogDate(from, to)) {
    let due = 0;
    let answered = 0;
    for (const planned of expandDueDoses(schedules, logDate)) {
      due++;
      if (answeredIds.has(`${logDate}:${planned.scheduleDoseId}`)) answered++;
    }
    byDate.set(logDate, { due, answered });
  }
  return byDate;
}

function maxLogDate(a: LogDate, b: LogDate): LogDate {
  return daysBetween(a, b) >= 0 ? b : a;
}

function minLogDate(a: LogDate, b: LogDate): LogDate {
  return daysBetween(a, b) >= 0 ? a : b;
}
