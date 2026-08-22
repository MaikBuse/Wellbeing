/**
 * Model C — the confounders, as first-class findings.
 *
 * For someone with RA these are usually MORE actionable than food, so they sit
 * in the same ranked list with a family badge rather than being exiled to a
 * second tab. Nine pre-registered binary exposures, all against the same
 * next-day outcome as Model B.
 *
 * ALL of them are next-day, never same-day. She fills in stress, fatigue and
 * general complaints in one sitting, in one mood, on one form: a same-day
 * association between two self-reports is common-method bias and cannot even
 * hint at a direction. The same-day versions are still shown in the descriptive
 * section, labelled as such, without a q-value.
 */
import { median } from '@/lib/stats/summary';
import { LOW_ADHERENCE_THRESHOLD } from './adherence';
import type { DailyFact } from './facts';

export type ConfounderSpec = {
  key: string;
  labelDe: string;
  /** null means "unknown for this day" — dropped, never counted as unexposed. */
  exposed: (day: DailyFact, context: ConfounderContext) => boolean | null;
};

export type ConfounderContext = {
  /** Trailing 7-day median steroid mg, for detecting a taper. */
  steroidTrailingMedian: (number | null)[];
  cycleLength: number;
  dayIndex: number;
};

export const SHORT_SLEEP_MINUTES = 420;
export const LOW_SLEEP_QUALITY = 4;
export const HIGH_STRESS = 7;
export const HIGH_ACTIVITY_INTENSITY = 7;

export const CONFOUNDER_SPECS: ConfounderSpec[] = [
  {
    key: 'sleep_short',
    labelDe: 'Wenig Schlaf',
    exposed: (day) =>
      day.sleepMinutes === null ? null : day.sleepMinutes < SHORT_SLEEP_MINUTES,
  },
  {
    key: 'sleep_quality_low',
    labelDe: 'Schlechter Schlaf',
    exposed: (day) =>
      day.sleepQuality === null ? null : day.sleepQuality <= LOW_SLEEP_QUALITY,
  },
  {
    key: 'stress_high',
    labelDe: 'Hoher Stress',
    exposed: (day) => (day.stress === null ? null : day.stress >= HIGH_STRESS),
  },
  {
    key: 'activity_none',
    labelDe: 'Keine Bewegung',
    exposed: (day) =>
      // A null is unknown, not zero minutes. Treating "not filled in" as "did
      // not move" would invent an exposure out of a skipped field.
      day.activityMinutes === null ? null : day.activityMinutes === 0,
  },
  {
    key: 'activity_high',
    labelDe: 'Intensive Bewegung',
    exposed: (day) =>
      day.activityIntensity === null
        ? null
        : day.activityIntensity >= HIGH_ACTIVITY_INTENSITY,
  },
  {
    key: 'steroid_taper',
    labelDe: 'Kortison im Abbau',
    exposed: (day, context) => {
      if (day.steroidMgPredEq === null) return null;
      const baseline = context.steroidTrailingMedian[context.dayIndex];
      if (baseline === null) return null;
      return day.steroidMgPredEq < baseline;
    },
  },
  {
    key: 'cycle_perimenstrual',
    labelDe: 'Tage um die Periode',
    exposed: (day) => day.perimenstrual,
  },
  {
    key: 'dmard_adherence_low',
    labelDe: 'Basistherapie unregelmäßig',
    exposed: (day) =>
      day.dmardAdherence7d === null
        ? null
        : day.dmardAdherence7d < LOW_ADHERENCE_THRESHOLD,
  },
];

/**
 * The weekday question, as ONE hypothesis rather than seven.
 *
 * The statistic is the range of the seven weekday mean deviations. Seven
 * pairwise weekday tests would be seven hypotheses for a question nobody can
 * act on, and would eat the false-discovery budget doing it.
 */
export const WEEKDAY_SPEC_KEY = 'weekday_pattern';

export function weekdayRange(
  days: readonly DailyFact[],
  outcome: Float64Array,
  usable: Uint8Array,
  dayOrder?: Int32Array | readonly number[],
  labelOffset = 0
): { range: number; means: (number | null)[] } {
  const buckets: number[][] = Array.from({ length: 7 }, () => []);
  const order = dayOrder ?? days.map((_, i) => i);
  for (let k = 0; k < order.length; k++) {
    const d = order[k];
    if (!usable[d]) continue;
    const value = outcome[d];
    if (!Number.isFinite(value)) continue;
    // The label is what gets rotated for the null; the outcome stays put.
    const donor = labelOffset === 0 ? d : (d + labelOffset) % days.length;
    buckets[days[donor].weekday].push(value);
  }
  const means = buckets.map((values) => {
    if (values.length === 0) return null;
    let sum = 0;
    for (const v of values) sum += v;
    return sum / values.length;
  });
  const present = means.filter((m): m is number => m !== null);
  const range =
    present.length < 2 ? 0 : Math.max(...present) - Math.min(...present);
  return { range, means };
}

/** Trailing median steroid dose, aligned like the RA baseline: past only. */
export function steroidTrailingMedian(
  days: readonly DailyFact[],
  windowDays = 7
): (number | null)[] {
  return days.map((_, index) => {
    const start = Math.max(0, index - windowDays);
    const window: number[] = [];
    for (let i = start; i < index; i++) {
      const value = days[i].steroidMgPredEq;
      if (value !== null) window.push(value);
    }
    return window.length === 0 ? null : median(window);
  });
}

/**
 * Build the exposure vector for a confounder over the dense day grid.
 *
 * `null` days are marked unusable rather than being folded into the unexposed
 * arm: "she did not record her sleep" is not "she slept well".
 */
export function confounderExposure(
  spec: ConfounderSpec,
  days: readonly DailyFact[],
  cycleLength: number
): { exposed: Uint8Array; known: Uint8Array } {
  const trailing = steroidTrailingMedian(days);
  const exposed = new Uint8Array(days.length);
  const known = new Uint8Array(days.length);

  for (let d = 0; d < days.length; d++) {
    const value = spec.exposed(days[d], {
      steroidTrailingMedian: trailing,
      cycleLength,
      dayIndex: d,
    });
    if (value === null) continue;
    known[d] = 1;
    exposed[d] = value ? 1 : 0;
  }

  return { exposed, known };
}
