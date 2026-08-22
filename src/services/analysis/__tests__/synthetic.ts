/**
 * Synthetic fact generators.
 *
 * Not a `.test.ts` file on purpose: the vitest `include` is
 * `src/**\/__tests__/**\/*.test.ts`, so this is importable from the suites
 * without being collected as one.
 *
 * These exist because CLAUDE.md demands it: the pipeline must be tested against
 * data with a KNOWN injected effect and against pure-noise data, and if it
 * finds signals in noise then Vitest should say so rather than the diet.
 *
 * Two properties of the generator matter more than the rest:
 *
 *  - the RA series is AR(1) with multi-week flares, because real flares last
 *    weeks and an iid outcome would make the block bootstrap look pointless.
 *  - exposure is generated in RUNS, not per-day coin flips. She eats bread for
 *    a week and then not. Clustered exposure against an autocorrelated outcome
 *    is the adversarial case that manufactures false positives, and a generator
 *    that flips a coin every day would quietly never test for it.
 */
import { sfc32, type Rng } from '@/lib/random';
import { addDays, weekdayOf, type LogDate } from '@/lib/time';
import { ONSET_LAG_MINUTES } from '@/lib/scales';
import { computeDeviations } from '../raIndex';
import type { DailyFact, Facts, MealFact, SymptomFact, TagDefRow } from '../facts';
import type { OnsetLagKey, SymptomGroupKey } from '../types';

export type SyntheticTagSpec = {
  key: string;
  window: OnsetLagKey;
  /** Probability that a run of exposure starts on any given day. */
  runStartProbability: number;
  /** Mean run length in days. */
  runLength: number;
  grams: number;
  minDoseGrams?: number;
};

export type InjectedEffect = {
  tagKey: string;
  model: 'meal_reaction' | 'ra_next_day';
  /**
   * For `meal_reaction`: the added probability of a notable reaction after an
   * exposed meal, in [0, 1]. For `ra_next_day`: the added RA index points on
   * the day after an exposed day.
   */
  effect: number;
};

export type SyntheticOptions = {
  seed: string;
  startDate?: LogDate;
  days: number;
  mealsPerDay?: [number, number];
  tags: SyntheticTagSpec[];
  injected?: InjectedEffect[];
  raBaseline?: {
    level: number;
    ar1: number;
    noiseSd: number;
    flareRate: number;
    flareLengthDays: [number, number];
  };
  loggingGaps?: { probability: number; maxLengthDays: number };
  /** Share of a meal's grams that is measurable and weighed. */
  measuredShare?: number;
  /**
   * Vary sleep and stress so Model C is actually exercised. Without this every
   * day carries the same sleep and the confounders sit at `not_yet` forever,
   * which would let a broken Model C ship untested.
   */
  varyConfounders?: boolean;
  /** Added RA index points on the day after a short night. */
  sleepEffect?: number;
  /**
   * How strongly a slowly-drifting latent "susceptibility" modulates the
   * per-meal reaction rate. Real complaints cluster — a bad gut week, not
   * scattered independent days — and without that clustering the meal-level
   * outcome would be iid, which would make the block bootstrap pointless by
   * construction and let a broken resampler pass the null tests.
   */
  susceptibilityStrength?: number;
};

const DEFAULT_BASELINE = {
  level: 4,
  ar1: 0.7,
  noiseSd: 1.2,
  flareRate: 0.004,
  flareLengthDays: [10, 25] as [number, number],
};

const GI_GROUPS: SymptomGroupKey[] = ['gi'];

function gaussian(rng: Rng): number {
  const u1 = Math.max(rng(), Number.MIN_VALUE);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function clampScore(value: number): number {
  return Math.min(10, Math.max(0, value));
}

/**
 * Snap to the six anchors the UI actually produces. Without this the synthetic
 * data would be smoother than anything the app can record, and the tests would
 * pass on a resolution the real pipeline never sees.
 */
function snapToAnchor(value: number): number {
  return Math.round(clampScore(value) / 2) * 2;
}

/** Exposure runs: a week of bread, then none. */
function exposureRuns(spec: SyntheticTagSpec, days: number, rng: Rng): boolean[] {
  const out = new Array<boolean>(days).fill(false);
  let day = 0;
  while (day < days) {
    if (rng() < spec.runStartProbability) {
      const length = Math.max(1, Math.round(spec.runLength * (0.5 + rng())));
      for (let i = 0; i < length && day + i < days; i++) out[day + i] = true;
      day += length;
    } else {
      day++;
    }
  }
  return out;
}

export function synthesiseFacts(options: SyntheticOptions): Facts {
  const rng = sfc32(options.seed);
  const startDate = options.startDate ?? '2025-01-01';
  const n = options.days;
  const baseline = options.raBaseline ?? DEFAULT_BASELINE;
  const [minMeals, maxMeals] = options.mealsPerDay ?? [2, 4];
  const measuredShare = options.measuredShare ?? 0.8;

  const dates: LogDate[] = [];
  for (let i = 0; i < n; i++) dates.push(addDays(startDate, i));

  // --- exposure, per tag, in runs ----------------------------------------
  const exposureByTag = new Map<string, boolean[]>();
  for (const spec of options.tags) {
    exposureByTag.set(spec.key, exposureRuns(spec, n, rng));
  }

  // --- flare periods ------------------------------------------------------
  const isFlare = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (isFlare[i]) continue;
    if (rng() < baseline.flareRate) {
      const [lo, hi] = baseline.flareLengthDays;
      const length = lo + Math.floor(rng() * (hi - lo + 1));
      for (let k = 0; k < length && i + k < n; k++) isFlare[i + k] = true;
      i += length;
    }
  }

  // --- the RA series: AR(1) plus flares plus any injected next-day effect --
  const nextDayEffect = new Map<number, number>();
  for (const injection of options.injected ?? []) {
    if (injection.model !== 'ra_next_day') continue;
    const exposed = exposureByTag.get(injection.tagKey);
    if (!exposed) continue;
    for (let i = 0; i < n - 1; i++) {
      if (exposed[i]) {
        nextDayEffect.set(i + 1, (nextDayEffect.get(i + 1) ?? 0) + injection.effect);
      }
    }
  }

  /*
   * --- confounder series, generated BEFORE the RA series so it can feed it --
   *
   * ALL of them vary, not just sleep and stress.
   *
   * It used to be those two only, which left the other seven constant or null —
   * so the confounder family shrank to m = 2, Benjamini-Hochberg barely
   * corrected, and a p of 0.04 came back as q = 0.08 and was called a discovery
   * on pure noise. The generator was quietly weakening the very correction that
   * the null tests exist to verify.
   */
  const sleepMinutes: (number | null)[] = [];
  const sleepQuality: (number | null)[] = [];
  const stress: (number | null)[] = [];
  const activityMinutes: (number | null)[] = [];
  const activityIntensity: (number | null)[] = [];
  const varyConfounders = options.varyConfounders ?? false;
  for (let i = 0; i < n; i++) {
    if (!varyConfounders) {
      sleepMinutes.push(420);
      sleepQuality.push(6);
      stress.push(4);
      activityMinutes.push(30);
      activityIntensity.push(null);
      continue;
    }
    // Short nights come in runs too — a bad week, not scattered days.
    sleepMinutes.push(rng() < 0.3 ? 300 + Math.floor(rng() * 100) : 420 + Math.floor(rng() * 120));
    sleepQuality.push(2 * Math.floor(rng() * 6));
    stress.push(2 * Math.floor(rng() * 6));
    activityMinutes.push(rng() < 0.25 ? 0 : Math.floor(rng() * 90));
    activityIntensity.push(2 * Math.floor(rng() * 6));
  }

  const sleepEffect = options.sleepEffect ?? 0;
  if (sleepEffect !== 0) {
    for (let i = 0; i < n - 1; i++) {
      const minutes = sleepMinutes[i];
      if (minutes !== null && minutes < 420) {
        nextDayEffect.set(i + 1, (nextDayEffect.get(i + 1) ?? 0) + sleepEffect);
      }
    }
  }

  const raRaw: number[] = [];
  let previous = 0;
  for (let i = 0; i < n; i++) {
    previous =
      baseline.ar1 * previous +
      Math.sqrt(1 - baseline.ar1 * baseline.ar1) * gaussian(rng);
    const flareBump = isFlare[i] ? 3 : 0;
    raRaw.push(
      clampScore(
        baseline.level +
          previous * baseline.noiseSd +
          flareBump +
          (nextDayEffect.get(i) ?? 0)
      )
    );
  }

  // --- logging gaps -------------------------------------------------------
  const hasLog = new Array<boolean>(n).fill(true);
  const gaps = options.loggingGaps;
  if (gaps) {
    for (let i = 0; i < n; i++) {
      if (rng() < gaps.probability) {
        const length = 1 + Math.floor(rng() * gaps.maxLengthDays);
        for (let k = 0; k < length && i + k < n; k++) hasLog[i + k] = false;
        i += length;
      }
    }
  }

  // --- meals, exposure per meal, symptoms ---------------------------------
  const meals: MealFact[] = [];
  const symptoms: SymptomFact[] = [];
  const mealEffect = new Map<string, number>();
  for (const injection of options.injected ?? []) {
    if (injection.model === 'meal_reaction') {
      mealEffect.set(injection.tagKey, injection.effect);
    }
  }

  // A latent AR(1) susceptibility per day, so reactions cluster in time.
  const susceptibilityStrength = options.susceptibilityStrength ?? 0.8;
  const susceptibility: number[] = [];
  let latent = 0;
  for (let i = 0; i < n; i++) {
    latent = 0.9 * latent + Math.sqrt(1 - 0.81) * gaussian(rng);
    susceptibility.push(latent);
  }

  let mealCounter = 0;
  for (let dayIdx = 0; dayIdx < n; dayIdx++) {
    const mealCount =
      minMeals + Math.floor(rng() * (maxMeals - minMeals + 1));

    for (let m = 0; m < mealCount; m++) {
      const id = `meal-${mealCounter++}`;
      // Spread meals over the waking day, in absolute instants.
      const hour = 8 + Math.floor((m / Math.max(1, mealCount)) * 12);
      const occurredAt = new Date(
        Date.UTC(
          Number(dates[dayIdx].slice(0, 4)),
          Number(dates[dayIdx].slice(5, 7)) - 1,
          Number(dates[dayIdx].slice(8, 10)),
          hour
        )
      );

      const gramsByTagKey: Record<string, number> = {};
      const doseByTagKey: Record<string, number> = {};
      let exposedHere: SyntheticTagSpec | null = null;

      for (const spec of options.tags) {
        const dayExposed = exposureByTag.get(spec.key)?.[dayIdx] ?? false;
        // On an exposed day, roughly one meal in two carries the tag.
        if (dayExposed && rng() < 0.5) {
          gramsByTagKey[spec.key] = spec.grams;
          doseByTagKey[spec.key] = spec.grams / 10;
          if (mealEffect.has(spec.key)) exposedHere = spec;
        }
      }

      meals.push({
        id,
        dayIndex: dayIdx,
        occurredAt,
        slot: 'lunch',
        gramsByTagKey,
        doseByTagKey,
        totalGrams: 400,
        blsGrams: 400 * measuredShare,
        statedGrams: 400 * measuredShare,
        blsGramsShare: measuredShare,
        portionEvidenceShare: measuredShare,
        hasExplicitReaction: false,
      });

      // Background reaction rate, modulated by the latent susceptibility, plus
      // any injected excess for this tag.
      const injected = exposedHere ? (mealEffect.get(exposedHere.key) ?? 0) : 0;
      const modulated =
        0.12 * (1 + susceptibilityStrength * susceptibility[dayIdx]);
      const probability = Math.min(
        0.95,
        Math.max(0.01, modulated) + injected
      );
      if (rng() < probability) {
        const window = exposedHere
          ? ONSET_LAG_MINUTES[exposedHere.window]
          : ONSET_LAG_MINUTES.early;
        const span = (window.toMinutes ?? window.fromMinutes + 60) - window.fromMinutes;
        const offset = window.fromMinutes + rng() * Math.max(1, span - 1);
        symptoms.push({
          occurredAt: new Date(occurredAt.getTime() + offset * 60_000),
          severity: 4 + 2 * Math.floor(rng() * 4),
          groups: GI_GROUPS,
          explicitMealId: null,
          assertedLag: exposedHere ? exposedHere.window : 'early',
        });
      }
    }
  }

  // --- assemble days ------------------------------------------------------
  const mealsByDay = new Map<number, MealFact[]>();
  for (const meal of meals) {
    const list = mealsByDay.get(meal.dayIndex) ?? [];
    list.push(meal);
    mealsByDay.set(meal.dayIndex, list);
  }

  const raValues: (number | null)[] = dates.map((_, i) =>
    hasLog[i] ? snapToAnchor(raRaw[i]) : null
  );
  const deviations = computeDeviations(raValues);

  const days: DailyFact[] = dates.map((logDate, i) => {
    const dayMeals = mealsByDay.get(i) ?? [];
    const gramsByTagKey: Record<string, number> = {};
    const doseByTagKey: Record<string, number> = {};
    let totalGrams = 0;
    let blsGrams = 0;
    let statedGrams = 0;
    for (const meal of dayMeals) {
      for (const [key, grams] of Object.entries(meal.gramsByTagKey)) {
        gramsByTagKey[key] = (gramsByTagKey[key] ?? 0) + grams;
      }
      for (const [key, dose] of Object.entries(meal.doseByTagKey)) {
        doseByTagKey[key] = (doseByTagKey[key] ?? 0) + dose;
      }
      totalGrams += meal.totalGrams;
      blsGrams += meal.blsGrams;
      statedGrams += meal.statedGrams;
    }

    return {
      logDate,
      raIndex: raValues[i],
      raComponents: {},
      deviation: deviations[i],
      isFlare: hasLog[i] ? isFlare[i] : false,
      hasDailyLog: hasLog[i],
      hasMeal: dayMeals.length > 0,
      hasSymptom: false,
      isTracked: dayMeals.length > 0 && hasLog[i],
      inProtocol: false,
      gramsByTagKey,
      doseByTagKey,
      blsGramsShare: totalGrams === 0 ? 0 : blsGrams / totalGrams,
      portionEvidenceShare: totalGrams === 0 ? 0 : statedGrams / totalGrams,
      sleepMinutes: hasLog[i] ? sleepMinutes[i] : null,
      sleepQuality: hasLog[i] ? sleepQuality[i] : null,
      stress: hasLog[i] ? stress[i] : null,
      activityMinutes: hasLog[i] ? activityMinutes[i] : null,
      activityIntensity: hasLog[i] ? activityIntensity[i] : null,
      steroidMgPredEq: null,
      steroidStep: 'none',
      cyclePhase: 'unknown',
      cycleDay: null,
      perimenstrual: null,
      dmardAdherence7d: null,
      weekday: weekdayOf(logDate),
    };
  });

  const tagDefs = new Map<string, TagDefRow>();
  options.tags.forEach((spec, index) => {
    tagDefs.set(spec.key, {
      id: `tag-${index}`,
      key: spec.key,
      labelDe: spec.key,
      isAnalysed: true,
      primaryWindow: spec.window,
      minDoseGrams: spec.minDoseGrams ?? 5,
    });
  });

  return {
    days,
    meals,
    symptoms,
    tagDefs,
    steroidFactorAssumed: false,
    cycleLength: 28,
    counts: {
      rangeDays: n,
      trackedDays: days.filter((d) => d.isTracked).length,
      daysWithRaIndex: days.filter((d) => d.raIndex !== null).length,
      daysWithOutcome: days.filter((d) => d.deviation !== null).length,
      meals: meals.length,
      symptomEntries: symptoms.length,
      blsGramsShare: measuredShare,
      portionEvidenceShare: measuredShare,
    },
  };
}

/**
 * A set of plausible tag specs for a multi-tag test, so a suite can ask "does
 * anything light up" over a realistic number of candidates.
 */
export function standardTagSpecs(count: number): SyntheticTagSpec[] {
  const windows: OnsetLagKey[] = ['immediate', 'early', 'mid', 'late'];
  return Array.from({ length: count }, (_, i) => ({
    key: `tag_${i}`,
    window: windows[i % windows.length],
    runStartProbability: 0.04 + (i % 5) * 0.01,
    runLength: 4 + (i % 4),
    grams: 30,
  }));
}
