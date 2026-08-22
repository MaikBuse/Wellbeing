/**
 * Model B — the RA-Tagesindex on the following day.
 *
 * Unit of analysis: the day. Candidates: the eleven nutrient-pattern tags whose
 * pre-declared window is `next_day`.
 *
 * Exposure is day-level, which matches what `min_dose_grams` documents: below
 * that amount a *day* does not count as exposed.
 *
 * The statistic is the difference in MEAN deviation, in index points. The
 * deviation from her own trailing median is roughly symmetric, so the mean is
 * the right summary and it is interpretable in the index's own units. A median
 * difference was rejected for a specific reason: the median of a deviation
 * series is ≈ 0 by construction, so it discriminates badly.
 */
import { mean } from '@/lib/stats/summary';
import type { DailyFact, TagDefRow } from './facts';
import type { SteroidStep } from './types';

export type DayArena = {
  nDays: number;
  /** Next-day deviation for day d; NaN when unusable as an outcome. */
  outcome: Float64Array;
  usable: Uint8Array;
  steroidStep: SteroidStep[];
  exposedByTagKey: Record<string, Uint8Array>;
};

/**
 * Which days can serve as an *exposure* day at all.
 *
 * Protocol days are excluded outright. `elimination.ts` says why in so many
 * words: including them makes the observational ranking circular, because she
 * only avoided the food when she felt bad.
 */
export function isUsableExposureDay(day: DailyFact): boolean {
  return day.isTracked && !day.inProtocol;
}

/**
 * Which days can serve as an *outcome* day.
 *
 * Flare days are excluded as outcomes but stay in the baseline. RA flares are
 * not caused by yesterday's dinner, and the first days of a flare produce the
 * largest positive deviations, so leaving them in would load every exposure
 * that happened to precede one. The cost is real — it discards her worst days,
 * where a true effect would be largest — which is why every finding also gets a
 * `flareKept` sensitivity estimate.
 */
export function isUsableOutcomeDay(
  day: DailyFact,
  flarePolicy: 'exclude' | 'keep'
): boolean {
  if (day.deviation === null) return false;
  if (day.inProtocol) return false;
  if (!day.isTracked) return false;
  if (flarePolicy === 'exclude' && day.isFlare) return false;
  return true;
}

export function buildDayArena(
  days: readonly DailyFact[],
  tags: readonly TagDefRow[],
  flarePolicy: 'exclude' | 'keep'
): DayArena {
  const nDays = days.length;
  const outcome = new Float64Array(nDays).fill(Number.NaN);
  const usable = new Uint8Array(nDays);
  const steroidStep: SteroidStep[] = [];

  for (let d = 0; d < nDays; d++) {
    steroidStep.push(days[d].steroidStep);
    const next = d + 1 < nDays ? days[d + 1] : null;
    const exposureOk = isUsableExposureDay(days[d]);
    if (next && exposureOk && isUsableOutcomeDay(next, flarePolicy)) {
      outcome[d] = next.deviation as number;
      usable[d] = 1;
    }
  }

  const exposedByTagKey: Record<string, Uint8Array> = {};
  for (const tag of tags) {
    const minDose = tag.minDoseGrams ?? 5;
    const flags = new Uint8Array(nDays);
    for (let d = 0; d < nDays; d++) {
      flags[d] = (days[d].gramsByTagKey[tag.key] ?? 0) >= minDose ? 1 : 0;
    }
    exposedByTagKey[tag.key] = flags;
  }

  return { nDays, outcome, usable, steroidStep, exposedByTagKey };
}

export type MeanDifference = {
  /** In RA-index points. */
  point: number;
  exposedDays: number;
  unexposedDays: number;
  exposedMean: number;
  unexposedMean: number;
};

const STEROID_STEPS: SteroidStep[] = ['none', 'low', 'medium', 'high'];

/**
 * Difference in mean next-day deviation, stratified by the steroid step and
 * pooled weighted by each stratum's exposed count.
 *
 * Cortisone is the ONE variable this stratifies on. It is the confounder that
 * both moves the outcome enormously and moves systematically over weeks: the
 * deviation outcome removes its *level* but not the *change during a taper*,
 * which is exactly the case `medication.ts` warns about — a food eaten while
 * tapering would otherwise look protective. Adding sleep or stress as a second
 * stratification variable was rejected: sixteen cells over a few hundred days
 * empties the table and turns the estimator into noise.
 */
export function meanDeviationDifference(
  arena: DayArena,
  exposed: Uint8Array,
  dayOrder: Int32Array | readonly number[],
  exposureOffset = 0
): MeanDifference | null {
  type Cell = { exposed: number[]; unexposed: number[] };
  const cells = new Map<SteroidStep, Cell>();
  for (const step of STEROID_STEPS) cells.set(step, { exposed: [], unexposed: [] });

  for (let k = 0; k < dayOrder.length; k++) {
    const day = dayOrder[k];
    if (!arena.usable[day]) continue;
    const value = arena.outcome[day];
    if (!Number.isFinite(value)) continue;

    const donor =
      exposureOffset === 0 ? day : (day + exposureOffset) % arena.nDays;
    const cell = cells.get(arena.steroidStep[day]);
    if (!cell) continue;
    (exposed[donor] ? cell.exposed : cell.unexposed).push(value);
  }

  let weightedSum = 0;
  let weight = 0;
  let exposedDays = 0;
  let unexposedDays = 0;
  let exposedTotal = 0;
  let unexposedTotal = 0;

  for (const step of STEROID_STEPS) {
    const cell = cells.get(step);
    if (!cell) continue;
    exposedDays += cell.exposed.length;
    unexposedDays += cell.unexposed.length;
    for (const v of cell.exposed) exposedTotal += v;
    for (const v of cell.unexposed) unexposedTotal += v;

    const me = mean(cell.exposed);
    const mu = mean(cell.unexposed);
    // A stratum with only one arm carries no contrast; it contributes nothing
    // rather than being silently compared against another stratum.
    if (me === null || mu === null) continue;
    weightedSum += cell.exposed.length * (me - mu);
    weight += cell.exposed.length;
  }

  if (weight === 0 || exposedDays === 0 || unexposedDays === 0) return null;

  return {
    point: weightedSum / weight,
    exposedDays,
    unexposedDays,
    exposedMean: exposedTotal / exposedDays,
    unexposedMean: unexposedTotal / unexposedDays,
  };
}
