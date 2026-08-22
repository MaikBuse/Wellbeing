/**
 * The RA-Tagesindex: one 0-10 number per logical day, higher = worse.
 *
 * This is NOT a DAS28 and must never be presented as one. There is no CRP or
 * ESR in this app, no swollen-joint count (`daily_log_joint.is_swollen` is
 * never written), no examiner, and the tender count is self-reported by touch.
 * What it is: a documented composite of the five things that ARE recorded every
 * day, weighted once, visibly, so that a ranking has something to rank against.
 *
 * The components are always shown beside it. One number is what you can sort;
 * only the breakdown says what drove it.
 */
import { stiffnessToScore, type RaComponent } from '@/lib/scales';
import { median } from '@/lib/stats/summary';

/** DAS28 counts 28 joint positions; the UI offers the 14 keys, both sides. */
export const DAS28_JOINT_KEYS = 14;

/**
 * Weights, summing to 1.
 *
 * `jointPain` leads because it is the most reliably entered and the most
 * RA-specific field. Stiffness *duration* is the classic inflammatory marker.
 * The tender count is the closest thing here to an objective measure. Fatigue
 * and general complaints are the quality-of-life half — which is what this app
 * is for, so they are not decoration.
 */
export const RA_INDEX_WEIGHTS: Record<RaComponent, number> = {
  jointPain: 0.3,
  tenderJoints: 0.2,
  stiffness: 0.2,
  fatigue: 0.15,
  complaints: 0.15,
};

/** The present components must carry at least this share of the total weight. */
export const MIN_WEIGHT_COVERAGE = 0.6;

export const BASELINE_WINDOW_DAYS = 7;
export const BASELINE_MIN_COVERAGE_DAYS = 4;

export type RaComponentInput = {
  jointPain: number | null;
  /** Count of marked DAS28 joints. Null when there is no daily_log row at all. */
  tenderCountDas28: number | null;
  morningStiffnessMinutes: number | null;
  fatigue: number | null;
  /** `daily_log.wellbeing`, read as a complaint level — see the relabel. */
  complaints: number | null;
};

export type RaIndexResult = {
  value: number | null;
  components: Partial<Record<RaComponent, number>>;
  /** Share of the total weight that was actually present. */
  coverage: number;
};

/**
 * Scale each component onto 0-10, renormalise the weights over the ones that
 * are present, and refuse to produce a number when too little is there.
 *
 * Two refusal rules, and the second is the one that matters:
 *
 *  - coverage below 0.6 -> null.
 *  - no core component -> null. Without this, a day where only fatigue and
 *    general complaints were filled in renormalises 0.15 + 0.15 to 1.0 and
 *    produces a *fatigue score* that then sits in the same series as real RA
 *    days. Silently mixing two different measures into one outcome is worse
 *    than having fewer days.
 *
 * A null index is NOT zero. Days with no daily_log row exist in quantity, and
 * imputing zero would read every lazily-logged day as a good day — which would
 * make any food eaten on a lazily-logged day look protective.
 */
export function computeRaIndex(input: RaComponentInput): RaIndexResult {
  const components: Partial<Record<RaComponent, number>> = {};

  if (input.jointPain !== null) components.jointPain = input.jointPain;
  if (input.tenderCountDas28 !== null) {
    components.tenderJoints = (input.tenderCountDas28 / DAS28_JOINT_KEYS) * 10;
  }
  if (input.morningStiffnessMinutes !== null) {
    components.stiffness = stiffnessToScore(input.morningStiffnessMinutes);
  }
  if (input.fatigue !== null) components.fatigue = input.fatigue;
  if (input.complaints !== null) components.complaints = input.complaints;

  let presentWeight = 0;
  let weighted = 0;
  for (const [key, value] of Object.entries(components) as [
    RaComponent,
    number,
  ][]) {
    const weight = RA_INDEX_WEIGHTS[key];
    presentWeight += weight;
    weighted += weight * value;
  }

  const coverage = presentWeight;
  const hasCore =
    components.jointPain !== undefined || components.tenderJoints !== undefined;

  if (presentWeight === 0 || coverage < MIN_WEIGHT_COVERAGE || !hasCore) {
    return { value: null, components, coverage };
  }

  // Clamp: a tender count of 14 with everything else at 10 is exactly 10, but
  // floating-point renormalisation can overshoot by a hair.
  const value = Math.min(10, Math.max(0, weighted / presentWeight));
  return { value, components, coverage };
}

/**
 * Deviation from the person's own trailing 7-day median.
 *
 * Trailing and strictly in the past: day `d` is excluded from its own baseline.
 * A centred window would contain the future, and in a next-day model the
 * outcome day's own value would enter its own baseline and shrink the very
 * effect being measured toward zero. Including `d` itself is the same mistake
 * in miniature — a one-day spike would lift its own baseline and partly cancel.
 *
 * The window is seven CALENDAR days, not "the last seven logged days": after a
 * three-week gap, today must not be compared against a baseline from a
 * different flare a month ago. Fewer than four covered days -> null.
 *
 * Flare days stay IN the baseline. They are her real state, and letting the
 * median absorb a multi-week flare is the entire reason the outcome is a
 * deviation rather than a level. This one mechanism absorbs cortisone level,
 * seasonality, disease trend and slow habit change for free — which is worth
 * saying plainly instead of pretending a regression did it.
 *
 * `values` must be a dense, contiguous per-day series; `null` means "no index
 * for that day".
 */
export function computeDeviations(
  values: readonly (number | null)[]
): (number | null)[] {
  return values.map((value, index) => {
    if (value === null) return null;
    const start = Math.max(0, index - BASELINE_WINDOW_DAYS);
    const window: number[] = [];
    for (let i = start; i < index; i++) {
      const previous = values[i];
      if (previous !== null) window.push(previous);
    }
    if (window.length < BASELINE_MIN_COVERAGE_DAYS) return null;
    const baseline = median(window);
    return baseline === null ? null : value - baseline;
  });
}

/** Trailing median of a numeric series, same alignment as the deviation. */
export function trailingMedian(
  values: readonly (number | null)[],
  windowDays: number
): (number | null)[] {
  return values.map((_, index) => {
    const start = Math.max(0, index - windowDays);
    const window: number[] = [];
    for (let i = start; i < index; i++) {
      const previous = values[i];
      if (previous !== null) window.push(previous);
    }
    return window.length === 0 ? null : median(window);
  });
}
