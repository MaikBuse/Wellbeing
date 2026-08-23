import { type NutrientKey } from '@/lib/nutrients';
import { NUTRIENT_TARGETS } from './targets/catalog';
import { scoredTargetKeys, targetDisplayOrder } from './targets/derive';
import type { TargetValue } from './targets/types';
import { dayGate, evaluateTarget } from './coverage';
import { FULL_CREDIT_MAIN_SLOTS } from '@/services/progress/completeness';
import { MIN_BLS_GRAMS_SHARE } from '@/services/analysis/exposure';
import type {
  DayNutrients,
  NutrientAssessment,
  NutritionDay,
  NutrientTotal,
} from './types';

/**
 * Turning intake and targets into one readable number, without lying.
 *
 * Three properties this file is built to keep:
 *
 *  1. `clamp01` is the FLOOR. No day can score worse than an unrecorded day.
 *     Without that, not recording becomes the rational move, and a symptom
 *     diary that punishes honesty stops being a diary.
 *  2. A nutrient that cannot be assessed leaves the DENOMINATOR, exactly like
 *     `applicable` in `completeness.ts`. It is never scored zero.
 *  3. The day score is `null`, never 0, when the day does not clear its gates.
 */

/** Below half the target, attainment is zero. */
export const MIN_RAMP_START = 0.5;
/** At 150 % of a limit, attainment is zero. */
export const OVER_SLACK = 1.5;

/**
 * Two tiers, not five.
 *
 * A weight vector nobody can defend entry by entry is a fudge factor. `ra` is
 * the handful with an actual rheumatology argument behind them: the n-6/n-3
 * balance, the fibre-microbiome link, and the bone side of long-term steroids.
 */
export const TIER_WEIGHT = { ra: 2, general: 1 } as const;

/** At or above this, a day counts as good. */
export const NUTRITION_GOOD_DAY = 75;

/*
 * 75, not the 90 of COMPLETE_DAY_THRESHOLD, and the two must never be shared.
 * Ninety percent of a recording checklist is reachable — every item is a tap.
 * Ninety percent of a weighted nutrient profile every single day is neither
 * reachable nor desirable, and a bar set there would only ever be a reproach.
 */

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** How fully a minimum was reached. Null lower bound means "nothing to reach". */
export function lowerPart(value: number, lower: number | null): number {
  if (lower === null || lower <= 0) return 1;
  const start = MIN_RAMP_START * lower;
  return clamp01((value - start) / (lower - start));
}

/** How far a limit was respected. Null limit means "exceeding is harmless". */
export function upperPart(
  value: number,
  upper: number | null,
  slack = OVER_SLACK
): number {
  if (upper === null || upper <= 0) return 1;
  if (value <= upper) return 1;
  return clamp01((slack * upper - value) / (slack * upper - upper));
}

/**
 * 0..1 for one nutrient on one day.
 *
 * The ramp starts at half the target rather than at zero: the raw ratio
 * overstates the bottom half — fifty percent of the fibre target is not half a
 * good day — while a yes/no would make the score flip on the rounding of a
 * portion estimate. The resolution belongs where behaviour actually changes,
 * between seventy and a hundred percent.
 *
 * `bandMax` is deliberately not read here. Being above the recommended band is
 * not a failure; being above a scored limit is.
 */
export function attainment(value: number, target: TargetValue): number {
  return Math.min(
    lowerPart(value, target.min),
    upperPart(value, target.max, target.overSlack ?? OVER_SLACK)
  );
}

function tierOf(key: NutrientKey): number {
  const definition = NUTRIENT_TARGETS[key];
  return definition?.evidence === 'ra_specific'
    ? TIER_WEIGHT.ra
    : TIER_WEIGHT.general;
}

export function assessNutrient(
  key: NutrientKey,
  total: NutrientTotal,
  target: TargetValue,
  context: { portionEvidenceShare: number; dayWellDocumented: boolean }
): NutrientAssessment {
  const definition = NUTRIENT_TARGETS[key];
  const evaluation = evaluateTarget(total, target, context);

  // showVerdict === false means the number is information, never a verdict.
  // Iron is why: anaemia in RA is largely anaemia of inflammation, and a bar
  // reading "missed" would push towards a supplement that cannot work.
  const judged = definition?.showVerdict ?? false;
  const status = judged ? evaluation.status : 'unknown';

  const scored =
    judged &&
    (definition?.inScore ?? false) &&
    evaluation.status !== 'unknown' &&
    total.total !== null;

  return {
    key,
    target,
    total,
    status,
    ratio: evaluation.ratio,
    isLowerBound: evaluation.isLowerBound,
    attainment: scored ? attainment(total.total as number, target) : null,
    scored,
    // Both come straight from the evaluation. `evaluateTarget` has always
    // computed `showValue` and this is the first consumer: without it every
    // 'unknown' collapsed into "zu wenig Messwerte" in the UI, including the
    // three cases where a number was sitting right there.
    showValue: evaluation.showValue,
    judged,
  };
}

/**
 * One day, assessed.
 *
 * `comparable` lets the caller substitute a seven-day mean for the nutrients
 * whose target has a weekly cadence — two fish meals a week is exactly right
 * and must not read as five misses. See `period.ts`.
 */
export function nutritionDay(
  day: DayNutrients,
  targets: ReadonlyMap<NutrientKey, TargetValue>,
  options: {
    isFlare: boolean;
    comparable?: Partial<Record<NutrientKey, NutrientTotal>>;
  }
): NutritionDay {
  const keys = targetDisplayOrder([...targets.keys()]);
  const nutrients: NutrientAssessment[] = [];

  /*
   * Under-documentation is not under-nutrition.
   *
   * A day with one main meal recorded, or with most of its grams outside the
   * catalog, is incomplete in the same direction a poorly covered nutrient is:
   * it can only understate. So it suppresses exactly the same verdicts — "short
   * of the target" and "under the limit" — while leaving the two that the
   * measured part already proves.
   */
  const context = {
    portionEvidenceShare: day.portionEvidenceShare,
    dayWellDocumented:
      day.mainSlots >= FULL_CREDIT_MAIN_SLOTS &&
      day.blsGramsShare >= MIN_BLS_GRAMS_SHARE,
  };

  for (const key of keys) {
    const target = targets.get(key);
    if (!target) continue;
    const total = options.comparable?.[key] ?? day.totals[key];
    if (!total) continue;
    nutrients.push(assessNutrient(key, total, target, context));
  }

  const scored = nutrients.filter((entry) => entry.scored);
  const gate = dayGate(day, scored.length, scoredTargetKeys(targets).length);

  if (!gate.ok) {
    return {
      logDate: day.logDate,
      score: null,
      reason: gate.reason,
      isFlare: options.isFlare,
      nutrients,
      assessableCount: scored.length,
    };
  }

  let weighted = 0;
  let weight = 0;
  for (const entry of scored) {
    const w = tierOf(entry.key);
    weighted += w * (entry.attainment as number);
    weight += w;
  }

  return {
    logDate: day.logDate,
    score: weight === 0 ? null : Math.round((weighted / weight) * 100),
    reason: weight === 0 ? 'zu_wenig_bekannt' : null,
    isFlare: options.isFlare,
    nutrients,
    assessableCount: scored.length,
  };
}

/**
 * A day that counts towards the quotient and the run.
 *
 * A flare day is neutral — out of the numerator AND the denominator. Not zero,
 * not a free pass: simply not counted, which is what `medicationRun` already
 * does with a day on which no dose was due. Counting a flare day as a miss
 * would tell someone their flare was a dietary failure; counting it as a hit
 * would put a number in the numerator that nothing measured.
 */
export function countsTowardsRun(day: NutritionDay): boolean {
  return !day.isFlare && day.score !== null;
}

export function isGoodDay(day: NutritionDay): boolean {
  return countsTowardsRun(day) && (day.score as number) >= NUTRITION_GOOD_DAY;
}
