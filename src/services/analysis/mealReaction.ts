/**
 * Model A — reaction per meal.
 *
 * Unit of analysis: the meal. Candidates: the trigger tags whose pre-declared
 * window is sub-daily (`immediate`, `early`, `mid`, `late`).
 *
 * ATTRIBUTION IS TIME-BASED, and `symptom_entry.meal_id` is never used to
 * compute an outcome. That is the single most consequential choice in this
 * model. The explicit link is *user-attributed* and carries her causal belief:
 * someone who suspects gluten is measurably more likely to open the reaction
 * sheet after a bread meal. Using it as the outcome would make the ranking a
 * mirror of her existing suspicions — differential recall, dressed as a result.
 * Window membership is arithmetic on two instants and is belief-free.
 *
 * Working in absolute instants also makes DST correctness automatic: ninety
 * minutes across the spring-forward boundary is still ninety minutes.
 */
import { ONSET_LAG_MINUTES } from '@/lib/scales';
import { mean } from '@/lib/stats/summary';
import type { DailyFact, MealFact, SymptomFact, TagDefRow } from './facts';
import type { OnsetLagKey, SymptomGroupKey } from './types';

/**
 * `'leicht'` and above on the existing severity scale. Pre-registered from
 * `SEVERITY_ANCHORS` rather than tuned — a threshold chosen after looking at
 * the data would be a free parameter nobody declared.
 */
export const NOTABLE_THRESHOLD = 4;

/**
 * MSK symptoms are excluded: they belong to the RA outcome, and counting the
 * same event in both models would use it twice. Joint pain thirty minutes after
 * lunch is noise. An entry with NO group at all is included — she rated a
 * severity without picking a type, and that happens and is real.
 */
export const MODEL_A_SYMPTOM_GROUPS: SymptomGroupKey[] = [
  'gi',
  'systemic',
  'skin',
  'airway',
  'other',
];

export const SUB_DAY_WINDOWS: OnsetLagKey[] = [
  'immediate',
  'early',
  'mid',
  'late',
];

export type MealArena = {
  nDays: number;
  nMeals: number;
  /** CSR: meals of day d are [dayStart[d], dayStart[d + 1]). */
  dayStart: Int32Array;
  /** Whether the meal's day can be used at all. */
  eligible: Uint8Array;
  /** Max qualifying severity in each window after each meal; -1 = none. */
  maxSeverityByWindow: Record<OnsetLagKey, Float64Array>;
  hasExplicitReaction: Uint8Array;
  gramsByTagKey: Record<string, Float64Array>;
};

function qualifies(symptom: SymptomFact): boolean {
  if (symptom.groups.length === 0) return true;
  return symptom.groups.some((g) => MODEL_A_SYMPTOM_GROUPS.includes(g));
}

/**
 * Pack the meals into flat typed arrays once, so a resample is pointer
 * arithmetic rather than object traversal.
 *
 * The window maxima are computed per WINDOW, not per tag: there are four
 * sub-day windows and up to thirty-one tags, so this is the same answer for a
 * fraction of the work.
 */
export function buildMealArena(
  days: readonly DailyFact[],
  meals: readonly MealFact[],
  symptoms: readonly SymptomFact[],
  tagKeys: readonly string[]
): MealArena {
  const ordered = [...meals].sort(
    (a, b) => a.dayIndex - b.dayIndex || a.occurredAt.getTime() - b.occurredAt.getTime()
  );
  const nDays = days.length;
  const nMeals = ordered.length;

  const dayStart = new Int32Array(nDays + 1);
  for (const meal of ordered) dayStart[meal.dayIndex + 1]++;
  for (let d = 0; d < nDays; d++) dayStart[d + 1] += dayStart[d];

  const eligible = new Uint8Array(nMeals);
  const hasExplicitReaction = new Uint8Array(nMeals);
  const gramsByTagKey: Record<string, Float64Array> = {};
  for (const key of tagKeys) gramsByTagKey[key] = new Float64Array(nMeals);

  const maxSeverityByWindow = {} as Record<OnsetLagKey, Float64Array>;
  for (const window of SUB_DAY_WINDOWS) {
    maxSeverityByWindow[window] = new Float64Array(nMeals).fill(-1);
  }
  maxSeverityByWindow.next_day = new Float64Array(nMeals).fill(-1);

  const qualifying = symptoms
    .filter(qualifies)
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const times = Float64Array.from(qualifying.map((s) => s.occurredAt.getTime()));
  const severities = Float64Array.from(qualifying.map((s) => s.severity));

  ordered.forEach((meal, i) => {
    eligible[i] = days[meal.dayIndex].isTracked ? 1 : 0;
    hasExplicitReaction[i] = meal.hasExplicitReaction ? 1 : 0;
    for (const key of tagKeys) {
      gramsByTagKey[key][i] = meal.gramsByTagKey[key] ?? 0;
    }

    const base = meal.occurredAt.getTime();
    for (const window of SUB_DAY_WINDOWS) {
      const { fromMinutes, toMinutes } = ONSET_LAG_MINUTES[window];
      const from = base + fromMinutes * 60_000;
      // Half-open [from, to): a symptom at exactly 30 minutes is `early`.
      const to = base + (toMinutes ?? 0) * 60_000;
      let best = -1;
      for (let s = lowerBound(times, from); s < times.length; s++) {
        if (times[s] >= to) break;
        if (severities[s] > best) best = severities[s];
      }
      maxSeverityByWindow[window][i] = best;
    }
  });

  return {
    nDays,
    nMeals,
    dayStart,
    eligible,
    maxSeverityByWindow,
    hasExplicitReaction,
    gramsByTagKey,
  };
}

function lowerBound(sorted: Float64Array, target: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export type MealTagSeries = {
  /** Per meal: 1 when the tag's grams reach the tag's minimum dose. */
  exposed: Uint8Array;
  /** Per meal: 1 when a qualifying reaction reached the notable threshold. */
  notable: Uint8Array;
  /** Per meal: the outcome severity, 0 when nothing was logged in the window. */
  severity: Float64Array;
};

/**
 * `max`, not sum and not mean.
 *
 * Severity is ordinal, so adding two entries is not a defined operation and
 * would make "she logged two things" read worse than one severe reaction. A
 * mean dilutes: one severe plus one mild reads milder than the severe alone. A
 * plain count throws the severity away entirely.
 *
 * A meal with no qualifying entry in the window scores 0 — and because the
 * reaction form drops the 0 anchor, a *logged* reaction is never 0, so every
 * zero here means "nothing was logged", which is exactly what it should mean.
 */
export function mealTagSeries(
  arena: MealArena,
  tag: TagDefRow
): MealTagSeries | null {
  const window = tag.primaryWindow;
  if (!window || !SUB_DAY_WINDOWS.includes(window)) return null;
  const grams = arena.gramsByTagKey[tag.key];
  if (!grams) return null;

  const minDose = tag.minDoseGrams ?? 5;
  const maxima = arena.maxSeverityByWindow[window];

  const exposed = new Uint8Array(arena.nMeals);
  const notable = new Uint8Array(arena.nMeals);
  const severity = new Float64Array(arena.nMeals);

  for (let i = 0; i < arena.nMeals; i++) {
    exposed[i] = grams[i] >= minDose ? 1 : 0;
    const value = maxima[i] < 0 ? 0 : maxima[i];
    severity[i] = value;
    notable[i] = value >= NOTABLE_THRESHOLD ? 1 : 0;
  }

  return { exposed, notable, severity };
}

export type RiskDifference = {
  /** In percentage points, so it can be said out loud. */
  pointPp: number;
  exposedMeals: number;
  exposedNotable: number;
  unexposedMeals: number;
  unexposedNotable: number;
};

/**
 * Risk difference of a notable reaction, over a (possibly resampled) sequence
 * of day indices.
 *
 * Chosen over the odds ratio because it is directly sayable — "12 of 40 meals
 * with gluten, 9 of 200 without" — degrades gracefully when a count is zero,
 * and is bounded. Nobody can act on an odds ratio, and it explodes when the
 * unexposed rate is 0.
 *
 * `exposureOffset` rotates the exposure labels by whole days for the
 * permutation null (see `rotatedExposure`).
 */
export function riskDifference(
  arena: MealArena,
  series: MealTagSeries,
  dayOrder: Int32Array | readonly number[],
  exposureOffset = 0
): RiskDifference | null {
  let exposedMeals = 0;
  let exposedNotable = 0;
  let unexposedMeals = 0;
  let unexposedNotable = 0;

  for (let k = 0; k < dayOrder.length; k++) {
    const day = dayOrder[k];
    const from = arena.dayStart[day];
    const to = arena.dayStart[day + 1];
    const count = to - from;
    if (count === 0) continue;

    for (let i = from; i < to; i++) {
      if (!arena.eligible[i]) continue;
      const isExposed = exposureOffset === 0
        ? series.exposed[i]
        : rotatedExposure(arena, series, day, i - from, exposureOffset);
      if (isExposed) {
        exposedMeals++;
        exposedNotable += series.notable[i];
      } else {
        unexposedMeals++;
        unexposedNotable += series.notable[i];
      }
    }
  }

  if (exposedMeals === 0 || unexposedMeals === 0) return null;
  const pointPp =
    (exposedNotable / exposedMeals - unexposedNotable / unexposedMeals) * 100;

  return { pointPp, exposedMeals, exposedNotable, unexposedMeals, unexposedNotable };
}

/**
 * The exposure label a meal would carry if the exposure series were rotated by
 * `offset` whole days.
 *
 * Rotation is the right null for a time series: it preserves the
 * autocorrelation of both series exactly and destroys only their alignment.
 * Doing it at DAY granularity is deliberate — exposure really is a day-level
 * decision ("she ate bread today"), so the day is the unit whose alignment is
 * under test.
 *
 * Where the donor day has a different number of meals, the label is taken
 * modulo its meal count. That is a documented approximation, and it is the
 * price of keeping the meal as the unit of analysis while rotating at the day
 * level; a donor day with no meals contributes "unexposed".
 */
function rotatedExposure(
  arena: MealArena,
  series: MealTagSeries,
  day: number,
  positionInDay: number,
  offset: number
): number {
  const donor = (day + offset) % arena.nDays;
  const from = arena.dayStart[donor];
  const count = arena.dayStart[donor + 1] - from;
  if (count === 0) return 0;
  return series.exposed[from + (positionInDay % count)];
}

/** Mean severity difference and probability of superiority — reported, never ranked. */
export function secondaryEffects(
  arena: MealArena,
  series: MealTagSeries
): { meanSeverityDiff: number | null; probabilityOfSuperiority: number | null } {
  const exposed: number[] = [];
  const unexposed: number[] = [];
  for (let i = 0; i < arena.nMeals; i++) {
    if (!arena.eligible[i]) continue;
    (series.exposed[i] ? exposed : unexposed).push(series.severity[i]);
  }
  const me = mean(exposed);
  const mu = mean(unexposed);

  let wins = 0;
  let ties = 0;
  if (exposed.length > 0 && unexposed.length > 0) {
    const sortedUnexposed = [...unexposed].sort((a, b) => a - b);
    for (const value of exposed) {
      wins += lowerBoundArray(sortedUnexposed, value);
      ties += countEqual(sortedUnexposed, value);
    }
  }

  return {
    meanSeverityDiff: me === null || mu === null ? null : me - mu,
    probabilityOfSuperiority:
      exposed.length === 0 || unexposed.length === 0
        ? null
        : (wins + 0.5 * ties) / (exposed.length * unexposed.length),
  };
}

function lowerBoundArray(sorted: readonly number[], target: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function countEqual(sorted: readonly number[], target: number): number {
  let count = 0;
  for (let i = lowerBoundArray(sorted, target); i < sorted.length; i++) {
    if (sorted[i] !== target) break;
    count++;
  }
  return count;
}

/**
 * The attribution-bias diagnostic.
 *
 * If exposed meals carry an explicit reaction entry far more often than
 * unexposed ones at the same measured symptom load, that gap IS the recall bias
 * — quantified, on the screen, instead of silently inside the estimate.
 */
export function attributionBias(
  arena: MealArena,
  series: MealTagSeries
): { explicitLinkRateExposed: number; explicitLinkRateUnexposed: number } | null {
  let exposedMeals = 0;
  let exposedLinked = 0;
  let unexposedMeals = 0;
  let unexposedLinked = 0;
  for (let i = 0; i < arena.nMeals; i++) {
    if (!arena.eligible[i]) continue;
    if (series.exposed[i]) {
      exposedMeals++;
      exposedLinked += arena.hasExplicitReaction[i];
    } else {
      unexposedMeals++;
      unexposedLinked += arena.hasExplicitReaction[i];
    }
  }
  if (exposedMeals === 0 || unexposedMeals === 0) return null;
  return {
    explicitLinkRateExposed: exposedLinked / exposedMeals,
    explicitLinkRateUnexposed: unexposedLinked / unexposedMeals,
  };
}
