import { FULL_CREDIT_MAIN_SLOTS } from '@/services/progress/completeness';
import {
  MIN_BLS_GRAMS_SHARE,
  MIN_PORTION_EVIDENCE_SHARE,
} from '@/services/analysis/exposure';
import type { TargetValue } from './targets/types';
import type { DayNutrients, NutrientTotal, TargetStatus } from './types';

/**
 * When a number may be shown, and when a target may be called met or missed.
 *
 * The thresholds from `analysis/exposure.ts` are IMPORTED rather than restated,
 * the same discipline `milestones.ts` applies to `GLOBAL_GATES`: two copies of
 * a rule drift, and the day they do, one screen calls a day interpretable while
 * another does not.
 *
 * The nutrient-level thresholds are deliberately stricter than the 0.6 over
 * there. `MIN_BLS_GRAMS_SHARE` guards a descriptive dose curve — "was there
 * lactose in this meal". Here the claim is quantitative — "you reached 62 % of
 * your calcium target" — and saying that about a day where four grams in ten
 * were never measured nudges towards a supplement on the strength of a gap.
 */

/** Below this, no number is shown for the nutrient at all. */
export const MIN_COVERAGE_FOR_VALUE = 0.5;
/** Below this, the number is a lower bound and no verdict is given. */
export const MIN_COVERAGE_FOR_TARGET = 0.8;

/** A day needs at least this many assessable nutrients to get a score. */
export const MIN_ASSESSABLE_COUNT = 4;
/** ...and at least this share of the ones that have a target. */
export const MIN_ASSESSABLE_SHARE = 0.5;

export type TargetEvaluation = {
  status: TargetStatus;
  /** value / bound, for ranking how far off a nutrient usually runs. */
  ratio: number | null;
  /**
   * The measured value can only be an underestimate.
   *
   * True whenever coverage is below `MIN_COVERAGE_FOR_TARGET`. The UI says
   * "mindestens" in front of the number instead of presenting it as the total.
   */
  isLowerBound: boolean;
  /** Whether to print a number at all. */
  showValue: boolean;
};

export function unknownEvaluation(): TargetEvaluation {
  return { status: 'unknown', ratio: null, isLowerBound: true, showValue: false };
}

/** value / bound, for ranking. Null when the target has no bound to rank against. */
function ratioAgainst(value: number, target: TargetValue): number | null {
  const bound = target.min ?? target.max;
  return bound !== null && bound > 0 ? value / bound : null;
}

/**
 * Compare one day's intake against one target.
 *
 * THE ASYMMETRY IS THE POINT, and it follows from "null is not zero": an
 * incompletely recorded day can only UNDERSTATE what was eaten.
 *
 *   direction   value beyond the bound        value short of the bound
 *   ---------   --------------------------    ------------------------------
 *   max         'exceeded' at ANY coverage    'met' only at full coverage
 *   min         'met' at ANY coverage         'missed' only at full coverage
 *
 * Read the max row twice, because it is the one that protects a limit. A day
 * can look clean on arachidonic acid purely because the meat was entered by
 * hand and never linked to the catalog — so "under the limit" is a claim that
 * needs the data behind it, while "over the limit" is already proven by the
 * part that was measured.
 */
export type EvaluationContext = {
  portionEvidenceShare: number;
  /**
   * Whether the DAY as a whole is documented well enough to speak for itself.
   *
   * A second kind of incompleteness beside the per-nutrient coverage, and it
   * acts the same way: a day with only breakfast recorded has structurally low
   * totals, so "short of the target" is not something the data supports. It
   * still supports "already over the limit" and "already past the minimum",
   * because those are proven by the part that was measured.
   */
  dayWellDocumented: boolean;
};

export function evaluateTarget(
  total: NutrientTotal,
  target: TargetValue,
  context: EvaluationContext
): TargetEvaluation {
  if (target.unavailableReason !== null) return unknownEvaluation();

  const value = total.total;
  if (value === null) return unknownEvaluation();

  /*
   * An unedited catalog entry is exactly 100 g, because the copy sets no
   * portion weight. Without stated amounts the "day total" is just a pile of
   * catalog values, and that is as true of the kcal number as of the calcium
   * one — so this gate withholds every verdict, macros included.
   *
   * It withholds the VERDICT, not the number. `quickAddFood` is the only add
   * path in the app and it writes `quantity 1, unit 'portion', portionId null`
   * for any food without a default measure, so this branch is the normal case
   * on a fresh day — returning `showValue: false` here made the day screen
   * print "zu wenig Messwerte" under every bar while the kcal line above it
   * filled from the very same rows.
   *
   * `isLowerBound` is FALSE here, and that is the one place this gate differs
   * from a poorly covered nutrient. A missing measurement can only understate;
   * a missing AMOUNT can go either way, because the 100 g the copy defaults to
   * may be more than what was eaten as easily as less. So the number is an
   * estimate, not a floor, and it must not be printed with "mindestens" in
   * front of it. That asymmetry is also why not even 'exceeded' survives this
   * gate: over a limit is only a fact while the amounts are real.
   */
  if (context.portionEvidenceShare < MIN_PORTION_EVIDENCE_SHARE) {
    return {
      status: 'unknown',
      ratio: ratioAgainst(value, target),
      isLowerBound: false,
      showValue: total.coverage >= MIN_COVERAGE_FOR_VALUE,
    };
  }

  const wellCovered =
    total.coverage >= MIN_COVERAGE_FOR_TARGET && context.dayWellDocumented;
  const isLowerBound = !wellCovered;

  if (target.max !== null && value > target.max) {
    return {
      status: 'exceeded',
      ratio: value / target.max,
      isLowerBound,
      // Over a limit is a fact even on a thin day: the measured part alone
      // already clears it.
      showValue: true,
    };
  }

  if (target.min !== null && value >= target.min) {
    return {
      status: 'met',
      ratio: value / target.min,
      isLowerBound,
      showValue: true,
    };
  }

  const ratio = ratioAgainst(value, target);
  const showValue = total.coverage >= MIN_COVERAGE_FOR_VALUE;

  if (!wellCovered) {
    return { status: 'unknown', ratio, isLowerBound: true, showValue };
  }

  // A pure limit that was not exceeded and has no minimum: staying under it is
  // the whole ask.
  if (target.min === null) {
    return { status: 'met', ratio, isLowerBound: false, showValue: true };
  }

  return { status: 'missed', ratio, isLowerBound: false, showValue };
}

export type DayGate =
  | { ok: true }
  | { ok: false; reason: 'zu_wenig_erfasst' | 'zu_wenig_bekannt' };

/**
 * Whether a day may carry a score at all.
 *
 * UNDER-DOCUMENTATION IS NOT UNDER-NUTRITION. A day with only breakfast
 * recorded has structurally low totals and every minimum would read as a
 * shortfall. The lie would not be "she ate badly" — the lie would be that the
 * app can tell the difference. So it says nothing, and `score` stays null
 * rather than becoming a low number.
 */
export function dayGate(
  day: DayNutrients,
  assessableCount: number,
  scoredTargetCount: number
): DayGate {
  if (day.totalGrams <= 0) return { ok: false, reason: 'zu_wenig_erfasst' };
  if (day.mainSlots < FULL_CREDIT_MAIN_SLOTS) {
    return { ok: false, reason: 'zu_wenig_erfasst' };
  }
  if (day.portionEvidenceShare < MIN_PORTION_EVIDENCE_SHARE) {
    return { ok: false, reason: 'zu_wenig_erfasst' };
  }
  if (day.blsGramsShare < MIN_BLS_GRAMS_SHARE) {
    return { ok: false, reason: 'zu_wenig_bekannt' };
  }
  const needed = Math.max(
    MIN_ASSESSABLE_COUNT,
    Math.ceil(scoredTargetCount * MIN_ASSESSABLE_SHARE)
  );
  if (assessableCount < needed) return { ok: false, reason: 'zu_wenig_bekannt' };
  return { ok: true };
}
