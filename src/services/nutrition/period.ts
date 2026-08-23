import { NUTRIENT_META, type NutrientKey } from '@/lib/nutrients';
import { isoWeekKey, type LogDate } from '@/lib/time';
import { NUTRIENT_TARGETS } from './targets/catalog';
import type { TargetValue } from './targets/types';
import { countsTowardsRun, isGoodDay } from './score';
import type {
  DayNutrients,
  NutrientTotal,
  NutritionDay,
  TargetStatus,
} from './types';

/** How many days a weekly-cadence target averages over. */
export const WEEKLY_WINDOW_DAYS = 7;

/**
 * Substitute a seven-day mean for the nutrients whose target has a weekly
 * cadence.
 *
 * Two oily-fish meals a week is exactly the recommendation, and comparing
 * EPA+DHA day by day would report "missed" on the five days in between. The
 * mean is taken over the days that actually carried a measurement, and the
 * resulting coverage is deflated by how much of the week that was — so a week
 * with one measurable day does not get to speak for the other six.
 */
export function weeklyComparables(
  days: readonly DayNutrients[],
  targets: ReadonlyMap<NutrientKey, TargetValue>
): Partial<Record<NutrientKey, NutrientTotal>>[] {
  const weeklyKeys = [...targets.entries()]
    .filter(([, target]) => target.cadence === 'weekly')
    .map(([key]) => key);

  return days.map((_, index) => {
    const from = Math.max(0, index - WEEKLY_WINDOW_DAYS + 1);
    const window = days.slice(from, index + 1);
    const out: Partial<Record<NutrientKey, NutrientTotal>> = {};

    for (const key of weeklyKeys) {
      const observed = window
        .map((day) => day.totals[key])
        .filter((entry): entry is NutrientTotal => entry?.total !== null);

      if (observed.length === 0) {
        out[key] = {
          fromFood: null,
          fromSupplement: 0,
          total: null,
          coveredGrams: 0,
          coverage: 0,
        };
        continue;
      }

      const mean = (pick: (entry: NutrientTotal) => number) =>
        observed.reduce((sum, entry) => sum + pick(entry), 0) / observed.length;

      out[key] = {
        fromFood: mean((entry) => entry.fromFood ?? 0),
        fromSupplement: mean((entry) => entry.fromSupplement),
        total: mean((entry) => entry.total ?? 0),
        coveredGrams: observed.reduce((sum, entry) => sum + entry.coveredGrams, 0),
        // Deflated by the share of the week that was measurable at all.
        coverage:
          (observed.length / window.length) * mean((entry) => entry.coverage),
      };
    }
    return out;
  });
}

export type NutritionSummary = {
  /** Days with a defensible score. Flare days are not among them. */
  assessableDays: number;
  /** Of those, days at or above NUTRITION_GOOD_DAY. */
  goodDays: number;
  /** goodDays / assessableDays, or null. Never 0/0 collapsed to 0. */
  ratio: number | null;
  /** Mean score over the assessable days, or null. */
  average: number | null;
  /** Days skipped because a flare was marked. */
  flareDaysSkipped: number;
  /** Days recorded but not defensible. */
  unreliableDays: number;
  /** Which nutrients fell short most often. A fact, not an instruction. */
  weakest: { key: NutrientKey; labelDe: string; days: number }[];
};

export const EMPTY_NUTRITION_SUMMARY: NutritionSummary = {
  assessableDays: 0,
  goodDays: 0,
  ratio: null,
  average: null,
  flareDaysSkipped: 0,
  unreliableDays: 0,
  weakest: [],
};

/**
 * Summarise a window of days.
 *
 * The denominator is ASSESSABLE days, never calendar days. Counting an
 * unrecorded day as a miss is "not measured = 0" one level up, and it punishes
 * honesty: the way to improve the number would be to stop recording thin days.
 */
export function nutritionWindow(
  days: readonly NutritionDay[]
): NutritionSummary {
  const counted = days.filter(countsTowardsRun);
  const good = counted.filter(isGoodDay);
  const flareDaysSkipped = days.filter((day) => day.isFlare).length;
  const unreliableDays = days.filter(
    (day) => !day.isFlare && day.score === null
  ).length;

  return {
    assessableDays: counted.length,
    goodDays: good.length,
    ratio: counted.length === 0 ? null : good.length / counted.length,
    average:
      counted.length === 0
        ? null
        : Math.round(
            counted.reduce((sum, day) => sum + (day.score as number), 0) /
              counted.length
          ),
    flareDaysSkipped,
    unreliableDays,
    weakest: weakestNutrients(counted),
  };
}

/**
 * Which nutrients fell short most often.
 *
 * Counted over assessable days only, and only where the nutrient itself had a
 * verdict — so a nutrient that is rarely measurable cannot win by being rare.
 * That is the same guard `weakestBlock` uses for a block that rarely applies.
 */
export function weakestNutrients(
  days: readonly NutritionDay[]
): { key: NutrientKey; labelDe: string; days: number }[] {
  const tally = new Map<NutrientKey, number>();
  for (const day of days) {
    for (const nutrient of day.nutrients) {
      if (nutrient.status !== 'missed' && nutrient.status !== 'exceeded') continue;
      tally.set(nutrient.key, (tally.get(nutrient.key) ?? 0) + 1);
    }
  }
  return [...tally.entries()]
    .map(([key, count]) => ({
      key,
      labelDe: NUTRIENT_META[key].labelDe,
      days: count,
    }))
    .sort((a, b) => b.days - a.days || a.labelDe.localeCompare(b.labelDe, 'de'));
}

export type PeriodResult = {
  key: NutrientKey;
  labelDe: string;
  daysInRange: number;
  /** Days where the nutrient got a verdict at all. */
  daysEvaluable: number;
  daysInTarget: number;
  /** null below the gate — an aggregate of three days is not an aggregate. */
  shareInTarget: number | null;
  /** Median of value / bound. Median, so one festive meal cannot move a month. */
  medianRatio: number | null;
  /** Daily values, oldest first, null where not evaluable. */
  series: (number | null)[];
};

/**
 * How many evaluable days an aggregate needs before it is worth stating.
 *
 * Below this the screen shows the individual days instead — the same stance
 * `GLOBAL_GATES` takes in the analysis, for the same reason.
 */
export const MIN_EVALUABLE_DAYS = { week: 4, month: 12 } as const;

export function summarisePeriod(
  key: NutrientKey,
  days: readonly NutritionDay[],
  minEvaluableDays: number
): PeriodResult {
  let daysEvaluable = 0;
  let daysInTarget = 0;
  const ratios: number[] = [];
  const series: (number | null)[] = [];

  for (const day of days) {
    const nutrient = day.nutrients.find((entry) => entry.key === key);
    const status: TargetStatus = nutrient?.status ?? 'unknown';
    if (day.isFlare || !nutrient || status === 'unknown') {
      series.push(null);
      continue;
    }
    daysEvaluable++;
    if (status === 'met') daysInTarget++;
    if (nutrient.ratio !== null) ratios.push(nutrient.ratio);
    series.push(nutrient.total.total);
  }

  return {
    key,
    labelDe: NUTRIENT_META[key].labelDe,
    daysInRange: days.length,
    daysEvaluable,
    daysInTarget,
    shareInTarget:
      daysEvaluable < minEvaluableDays ? null : daysInTarget / daysEvaluable,
    medianRatio: ratios.length === 0 ? null : median(ratios),
    series,
  };
}

/**
 * Every targeted nutrient, worst first.
 *
 * Sorted by how rarely the target was reached, so the answer to "what is
 * chronically short" is the top of the list rather than something to hunt for.
 */
export function periodScoreboard(
  days: readonly NutritionDay[],
  minEvaluableDays: number
): PeriodResult[] {
  const keys = new Set<NutrientKey>();
  for (const day of days) {
    for (const nutrient of day.nutrients) {
      if (NUTRIENT_TARGETS[nutrient.key]?.showVerdict) keys.add(nutrient.key);
    }
  }
  return [...keys]
    .map((key) => summarisePeriod(key, days, minEvaluableDays))
    .sort((a, b) => {
      if (a.shareInTarget === null && b.shareInTarget === null) {
        return a.labelDe.localeCompare(b.labelDe, 'de');
      }
      if (a.shareInTarget === null) return 1;
      if (b.shareInTarget === null) return -1;
      return a.shareInTarget - b.shareInTarget;
    });
}

/** Group days into ISO weeks, oldest first. `isoWeekKey` handles year ends. */
export function byIsoWeek(
  days: readonly NutritionDay[]
): { week: string; days: NutritionDay[] }[] {
  const buckets = new Map<string, NutritionDay[]>();
  for (const day of days) {
    const key = isoWeekKey(day.logDate as LogDate);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(day);
    else buckets.set(key, [day]);
  }
  return [...buckets.entries()].map(([week, entries]) => ({ week, days: entries }));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}
