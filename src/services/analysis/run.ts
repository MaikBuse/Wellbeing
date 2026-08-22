/**
 * The orchestrator. Pure: facts in, findings out, no database and no clock.
 *
 * Two decisions here shape everything downstream.
 *
 * ONE FAMILY OF 42, NOT 84. Each food tag is tested by exactly one model,
 * routed by its own `primary_window`. That is not a shortcut — it is the
 * mechanism `food_tag_def.primary_window` was created for, and its own doc
 * comment says why: "testing every tag against every window would multiply the
 * number of hypotheses and manufacture false positives". Running both models
 * for all 42 tags would be 84 hypotheses, would halve the power, and would make
 * the pre-commitment meaningless. The honest price: gluten's effect on the next
 * day's RA index is not tested. `exploratoryCrossModel` is the declared escape
 * hatch and is off.
 *
 * ONE RESAMPLE SEQUENCE PER ITERATION, SHARED BY EVERY TAG. Roughly a 40x
 * saving, and statistically preferable: the tags then share their resampling
 * noise, so their intervals are directly comparable rather than each carrying
 * its own independent wobble.
 */
import { sfc32 } from '@/lib/random';
import {
  estimateBlockLength,
  stationaryBlockIndices,
} from '@/lib/stats/bootstrap';
import { rotationPValue } from '@/lib/stats/permutation';
import { benjaminiHochberg } from '@/lib/stats/fdr';
import { countRuns, quantile } from '@/lib/stats/summary';
import { ONSET_LAG_MINUTES } from '@/lib/scales';
import { balanceTable } from './balance';
import { COLLINEARITY_THRESHOLD, MEASURED_FIELD_BY_TAG, collinearity } from './exposure';
import {
  CONFOUNDER_SPECS,
  WEEKDAY_SPEC_KEY,
  confounderExposure,
  weekdayRange,
} from './confounders';
import {
  GLOBAL_GATES,
  MODEL_A_GATES,
  MODEL_B_GATES,
  allPassed,
  gate,
  type GateResult,
} from './gates';
import {
  attributionBias,
  buildMealArena,
  mealTagSeries,
  riskDifference,
  secondaryEffects,
  SUB_DAY_WINDOWS,
  MODEL_A_SYMPTOM_GROUPS,
  NOTABLE_THRESHOLD,
  type MealArena,
  type MealTagSeries,
} from './mealReaction';
import { buildDayArena, meanDeviationDifference, type DayArena } from './raNextDay';
import { TRACKED_DAY_RULE, type Facts, type TagDefRow } from './facts';
import {
  ALGORITHM_VERSION,
  type AnalysisFinding,
  type AnalysisParams,
  type EffectKind,
  type FindingLabel,
  type MeasurementBasis,
} from './types';

export const BOOTSTRAP_RESAMPLES = 2000;
export const ROTATION_RESAMPLES = 2000;
export const FDR_ALPHA = 0.1;
/** The "possible" band: weaker than a discovery, strong enough to look at. */
export const POSSIBLE_Q = 0.25;
export const TOP_RANK_FOR_STABILITY = 5;

export type RunOptions = {
  seed: string;
  timeZone: string;
  dayStartHour: number;
  countTraceExposure: boolean;
  bootstrapResamples?: number;
  rotationResamples?: number;
  alpha?: number;
  /** Test-only: swap in a deliberately wrong iid resampler. */
  resampler?: (n: number, blockLength: number, rng: () => number) => Int32Array;
  catalog?: { rowCount: number; maxUpdatedAt: string | null };
};

export type RunResult = {
  params: AnalysisParams;
  findings: AnalysisFinding[];
};

type Candidate = {
  key: string;
  labelDe: string;
  family: 'food_tag' | 'confounder';
  model: 'meal_reaction' | 'ra_next_day';
  window: string | null;
  measurementBasis: MeasurementBasis;
  effectKind: EffectKind;
  /**
   * False for the weekday omnibus, whose statistic is a RANGE and therefore
   * always non-negative — "the interval excludes zero" is vacuously true there
   * and must not be allowed to promote it.
   */
  signed: boolean;
  /** Day-level exposure vector, for collinearity and the balance table. */
  dayExposure: Uint8Array;
  gates: GateResult[];
  /** Null when a gate failed, so nothing is estimated for it. */
  estimate:
    | null
    | {
        point: number;
        statistic: (dayOrder: Int32Array, offset: number) => number | null;
        exposed: { n: number; distinctDays: number; runs: number; notable: number | null; mean: number | null };
        unexposed: { n: number; notable: number | null; mean: number | null };
      };
  secondary: AnalysisFinding['secondary'];
  attributionBias: AnalysisFinding['attributionBias'];
  doseResponse: AnalysisFinding['doseResponse'];
  sensitivityPoint: number | null;
};

export function computeSuspicionRanking(
  facts: Facts,
  options: RunOptions
): RunResult {
  const alpha = options.alpha ?? FDR_ALPHA;
  const bootstrapResamples = options.bootstrapResamples ?? BOOTSTRAP_RESAMPLES;
  const rotationResamples = options.rotationResamples ?? ROTATION_RESAMPLES;

  const days = facts.days;
  const nDays = days.length;
  const tags = [...facts.tagDefs.values()];

  const tagKeys = tags.map((t) => t.key);
  const mealArena = buildMealArena(days, facts.meals, facts.symptoms, tagKeys);
  const dayArena = buildDayArena(days, tags, 'exclude');
  const dayArenaFlareKept = buildDayArena(days, tags, 'keep');

  const deviationSeries = days
    .map((d) => d.deviation)
    .filter((v): v is number => v !== null);
  const { blockLength, acfLagUsed } = estimateBlockLength(deviationSeries);

  const globalGates = [
    gate('trackedDays', facts.counts.trackedDays, GLOBAL_GATES.trackedDays),
    gate('daysWithRaIndex', facts.counts.daysWithRaIndex, GLOBAL_GATES.daysWithRaIndex),
  ];
  const globalOk = allPassed(globalGates);

  const candidates: Candidate[] = [
    ...foodTagCandidates(facts, mealArena, dayArena, dayArenaFlareKept, globalGates, globalOk),
    ...confounderCandidates(facts, dayArena, globalGates, globalOk),
  ];

  /* --- shared bootstrap -------------------------------------------------- */

  const tested = candidates.filter((c) => c.estimate !== null);
  const bootstrapSamples = new Map<string, number[]>();
  for (const candidate of tested) bootstrapSamples.set(candidate.key, []);

  const bootRng = sfc32(`${options.seed}:bootstrap`);
  const resampler = options.resampler ?? stationaryBlockIndices;
  for (let b = 0; b < bootstrapResamples; b++) {
    const order = resampler(nDays, blockLength, bootRng);
    for (const candidate of tested) {
      const value = candidate.estimate!.statistic(order, 0);
      if (value !== null && Number.isFinite(value)) {
        bootstrapSamples.get(candidate.key)!.push(value);
      }
    }
  }

  /* --- shared rotation null ---------------------------------------------- */

  const identity = new Int32Array(nDays);
  for (let i = 0; i < nDays; i++) identity[i] = i;

  const rotationSamples = new Map<string, number[]>();
  for (const candidate of tested) rotationSamples.set(candidate.key, []);

  const rotRng = sfc32(`${options.seed}:rotation`);
  for (let r = 0; r < rotationResamples; r++) {
    const offset = 1 + Math.floor(rotRng() * Math.max(1, nDays - 1));
    for (const candidate of tested) {
      const value = candidate.estimate!.statistic(identity, offset);
      if (value !== null && Number.isFinite(value)) {
        rotationSamples.get(candidate.key)!.push(value);
      }
    }
  }

  /* --- assemble, then BH per family -------------------------------------- */

  const draft = candidates.map((candidate) => {
    if (!candidate.estimate) {
      return { candidate, effect: null, pValue: null };
    }
    const samples = bootstrapSamples.get(candidate.key) ?? [];
    const ciLow = quantile(samples, 0.025);
    const ciHigh = quantile(samples, 0.975);
    const pValue = rotationPValue(
      candidate.estimate.point,
      rotationSamples.get(candidate.key) ?? []
    );
    return {
      candidate,
      effect:
        ciLow === null || ciHigh === null
          ? null
          : { kind: candidate.effectKind, point: candidate.estimate.point, ciLow, ciHigh },
      pValue,
    };
  });

  const families: AnalysisFinding['family'][] = ['food_tag', 'confounder'];
  const qByKey = new Map<string, number>();
  const familySizes: Record<string, { m: number }> = {};

  for (const family of families) {
    const inFamily = draft.filter(
      (d) => d.candidate.family === family && d.pValue !== null
    );
    const { qValues, m } = benjaminiHochberg(
      inFamily.map((d) => d.pValue as number),
      alpha
    );
    inFamily.forEach((d, i) => qByKey.set(d.candidate.key, qValues[i]));
    familySizes[family] = { m };
  }

  const findings: AnalysisFinding[] = draft.map(({ candidate, effect, pValue }) => {
    const qValue = qByKey.get(candidate.key) ?? null;
    const label = classify(candidate, effect, qValue, alpha);
    const evidenceStrength = shrunkEffect(effect);
    const width = effect ? effect.ciHigh - effect.ciLow : 0;
    const sortScore =
      effect && width > 0 ? Math.abs(evidenceStrength) / (width / 3.92) : 0;

    return {
      family: candidate.family,
      model: candidate.model,
      key: candidate.key,
      labelDe: candidate.labelDe,
      window: candidate.window,
      measurementBasis: candidate.measurementBasis,
      status: candidate.estimate ? 'tested' : 'not_yet',
      label,
      effect,
      evidenceStrength,
      sortScore,
      rank: null,
      pValue,
      qValue,
      exposed:
        candidate.estimate?.exposed ??
        { n: 0, distinctDays: 0, runs: 0, notable: null, mean: null },
      unexposed: candidate.estimate?.unexposed ?? { n: 0, notable: null, mean: null },
      secondary: candidate.secondary,
      doseResponse: candidate.doseResponse,
      balance: balanceTable(days, candidate.dayExposure, usableDays(dayArena)),
      collinearWith: [],
      attributionBias: candidate.attributionBias,
      sensitivity:
        candidate.sensitivityPoint === null
          ? null
          : {
              flareKept: {
                kind: candidate.effectKind,
                point: candidate.sensitivityPoint,
                ciLow: candidate.sensitivityPoint,
                ciHigh: candidate.sensitivityPoint,
              },
            },
      gates: candidate.gates.map(({ gate: g, have, need, passed }) => ({
        gate: g,
        have,
        need,
        passed,
      })),
      stability: { weeksInTopFive: 0, previousRank: null },
    };
  });

  attachCollinearity(findings, candidates, facts);
  rankWithinUnits(findings);

  const params: AnalysisParams = {
    algorithmVersion: ALGORITHM_VERSION,
    seed: options.seed,
    range: {
      from: days[0]?.logDate ?? '1970-01-01',
      to: days[days.length - 1]?.logDate ?? '1970-01-01',
    },
    timeZone: options.timeZone,
    dayStartHour: options.dayStartHour,
    countTraceExposure: options.countTraceExposure,
    confidencesCounted: options.countTraceExposure
      ? ['certain', 'likely', 'trace']
      : ['certain', 'likely'],
    trackedDayRule: TRACKED_DAY_RULE,
    raIndex: {
      weights: {
        jointPain: 0.3,
        tenderJoints: 0.2,
        stiffness: 0.2,
        fatigue: 0.15,
        complaints: 0.15,
      },
      minWeightCoverage: 0.6,
      requireCore: true,
      complaintsPolarity: 'severity',
    },
    baseline: { windowDays: 7, minCoverageDays: 4, align: 'trailing_exclusive' },
    bootstrap: {
      kind: 'stationary_circular',
      resamples: bootstrapResamples,
      expectedBlockLength: blockLength,
      acfLagUsed,
    },
    permutation: { kind: 'circular_rotation', resamples: rotationResamples },
    fdr: { procedure: 'benjamini_hochberg', alpha, families: familySizes },
    modelA: {
      notableThreshold: NOTABLE_THRESHOLD,
      symptomGroups: MODEL_A_SYMPTOM_GROUPS,
      attribution: 'time_window',
      windows: ONSET_LAG_MINUTES,
    },
    modelB: { stratifyBy: 'steroid_step', flarePolicy: 'exclude_outcome' },
    gates: { ...MODEL_A_GATES, ...MODEL_B_GATES, ...GLOBAL_GATES },
    exclusions: {
      protocolDays: days.filter((d) => d.inProtocol).length,
      flareDaysExcluded: days.filter((d) => d.isFlare).length,
      untrackedDaysExcluded: days.filter((d) => !d.isTracked).length,
    },
    counts: {
      ...facts.counts,
      windowAgreementRate: windowAgreement(facts),
    },
    catalog: options.catalog ?? { rowCount: 0, maxUpdatedAt: null },
    steroidFactorAssumed: facts.steroidFactorAssumed,
    exploratoryCrossModel: false,
  };

  return { params, findings };
}

/* -------------------------------------------------------------------------- */

function usableDays(arena: DayArena): Uint8Array {
  return arena.usable;
}

function foodTagCandidates(
  facts: Facts,
  mealArena: MealArena,
  dayArena: DayArena,
  dayArenaFlareKept: DayArena,
  globalGates: GateResult[],
  globalOk: boolean
): Candidate[] {
  const out: Candidate[] = [];

  for (const tag of facts.tagDefs.values()) {
    const window = tag.primaryWindow;
    if (!window) continue;

    const basis: MeasurementBasis = MEASURED_FIELD_BY_TAG[tag.key]
      ? 'measured'
      : 'rule';

    if (SUB_DAY_WINDOWS.includes(window)) {
      out.push(modelACandidate(facts, mealArena, dayArena, tag, basis));
    } else {
      out.push(
        modelBCandidate(facts, dayArena, dayArenaFlareKept, tag, basis, globalGates, globalOk)
      );
    }
  }

  return out;
}

function modelACandidate(
  facts: Facts,
  arena: MealArena,
  dayArena: DayArena,
  tag: TagDefRow,
  basis: MeasurementBasis
): Candidate {
  const series = mealTagSeries(arena, tag);
  const dayExposure = dayArena.exposedByTagKey[tag.key] ?? new Uint8Array(facts.days.length);

  const identity = allDays(arena.nDays);
  const observed = series ? riskDifference(arena, series, identity, 0) : null;

  const distinctDays = countExposedDays(arena, series);
  const runs = countRuns(Array.from(dayExposure, (v) => v === 1));
  const notableTotal = observed
    ? observed.exposedNotable + observed.unexposedNotable
    : 0;

  const gates: GateResult[] = [
    gate('exposedMeals', observed?.exposedMeals ?? 0, MODEL_A_GATES.exposedMeals),
    gate('unexposedMeals', observed?.unexposedMeals ?? 0, MODEL_A_GATES.unexposedMeals),
    gate('exposedDistinctDays', distinctDays, MODEL_A_GATES.exposedDistinctDays),
    gate('notableReactionsTotal', notableTotal, MODEL_A_GATES.notableReactionsTotal),
  ];

  const passed = allPassed(gates) && series !== null && observed !== null;

  return {
    key: tag.key,
    labelDe: tag.labelDe,
    family: 'food_tag',
    model: 'meal_reaction',
    window: tag.primaryWindow,
    measurementBasis: basis,
    effectKind: 'risk_difference_pp',
    signed: true,
    dayExposure,
    gates,
    estimate:
      passed && series && observed
        ? {
            point: observed.pointPp,
            statistic: (dayOrder, offset) => {
              const result = riskDifference(arena, series, dayOrder, offset);
              return result === null ? null : result.pointPp;
            },
            exposed: {
              n: observed.exposedMeals,
              distinctDays,
              runs,
              notable: observed.exposedNotable,
              mean: null,
            },
            unexposed: {
              n: observed.unexposedMeals,
              notable: observed.unexposedNotable,
              mean: null,
            },
          }
        : null,
    secondary:
      passed && series
        ? { ...secondaryEffects(arena, series), perComponent: null }
        : null,
    attributionBias: series ? attributionBias(arena, series) : null,
    doseResponse: series ? doseResponseForMeals(facts, arena, series, tag) : null,
    sensitivityPoint: null,
  };
}

function modelBCandidate(
  facts: Facts,
  arena: DayArena,
  flareKept: DayArena,
  tag: TagDefRow,
  basis: MeasurementBasis,
  globalGates: GateResult[],
  globalOk: boolean
): Candidate {
  const exposed = arena.exposedByTagKey[tag.key] ?? new Uint8Array(arena.nDays);
  const identity = allDays(arena.nDays);
  const observed = meanDeviationDifference(arena, exposed, identity, 0);

  let exposedDays = 0;
  let unexposedDays = 0;
  for (let d = 0; d < arena.nDays; d++) {
    if (exposed[d]) exposedDays++;
    else unexposedDays++;
  }

  const gates: GateResult[] = [
    ...globalGates,
    gate('exposedDays', exposedDays, MODEL_B_GATES.exposedDays),
    gate('unexposedDays', unexposedDays, MODEL_B_GATES.unexposedDays),
    gate(
      'exposedRuns',
      countRuns(Array.from(exposed, (v) => v === 1)),
      MODEL_B_GATES.exposedRuns
    ),
    gate(
      'exposedDaysWithOutcome',
      observed?.exposedDays ?? 0,
      MODEL_B_GATES.exposedDaysWithOutcome
    ),
    gate(
      'unexposedDaysWithOutcome',
      observed?.unexposedDays ?? 0,
      MODEL_B_GATES.unexposedDaysWithOutcome
    ),
  ];

  const passed = globalOk && allPassed(gates) && observed !== null;
  const sensitivity = meanDeviationDifference(flareKept, exposed, identity, 0);

  return {
    key: tag.key,
    labelDe: tag.labelDe,
    family: 'food_tag',
    model: 'ra_next_day',
    window: tag.primaryWindow,
    measurementBasis: basis,
    effectKind: 'mean_index_points',
    signed: true,
    dayExposure: exposed,
    gates,
    estimate:
      passed && observed
        ? {
            point: observed.point,
            statistic: (dayOrder, offset) => {
              const result = meanDeviationDifference(arena, exposed, dayOrder, offset);
              return result === null ? null : result.point;
            },
            exposed: {
              n: observed.exposedDays,
              distinctDays: exposedDays,
              runs: countRuns(Array.from(exposed, (v) => v === 1)),
              notable: null,
              mean: observed.exposedMean,
            },
            unexposed: {
              n: observed.unexposedDays,
              notable: null,
              mean: observed.unexposedMean,
            },
          }
        : null,
    secondary: null,
    attributionBias: null,
    doseResponse: doseResponseForDays(facts, arena, exposed, tag),
    sensitivityPoint: sensitivity?.point ?? null,
  };
}

function confounderCandidates(
  facts: Facts,
  arena: DayArena,
  globalGates: GateResult[],
  globalOk: boolean
): Candidate[] {
  const out: Candidate[] = [];

  for (const spec of CONFOUNDER_SPECS) {
    const { exposed, known } = confounderExposure(spec, facts.days, facts.cycleLength);
    const masked = new Uint8Array(arena.nDays);
    for (let d = 0; d < arena.nDays; d++) masked[d] = known[d] && exposed[d] ? 1 : 0;

    // Days where the confounder is unknown must not be silently unexposed.
    const restricted: DayArena = {
      ...arena,
      usable: Uint8Array.from(arena.usable, (v, d) => (known[d] ? v : 0)),
    };

    const identity = allDays(arena.nDays);
    const observed = meanDeviationDifference(restricted, masked, identity, 0);

    let exposedDays = 0;
    let unexposedDays = 0;
    for (let d = 0; d < arena.nDays; d++) {
      if (!known[d]) continue;
      if (exposed[d]) exposedDays++;
      else unexposedDays++;
    }

    const gates: GateResult[] = [
      ...globalGates,
      gate('exposedDays', exposedDays, MODEL_B_GATES.exposedDays),
      gate('unexposedDays', unexposedDays, MODEL_B_GATES.unexposedDays),
      gate(
        'exposedDaysWithOutcome',
        observed?.exposedDays ?? 0,
        MODEL_B_GATES.exposedDaysWithOutcome
      ),
      gate(
        'unexposedDaysWithOutcome',
        observed?.unexposedDays ?? 0,
        MODEL_B_GATES.unexposedDaysWithOutcome
      ),
    ];

    const passed = globalOk && allPassed(gates) && observed !== null;

    out.push({
      key: spec.key,
      labelDe: spec.labelDe,
      family: 'confounder',
      model: 'ra_next_day',
      window: null,
      measurementBasis: 'self_reported',
      effectKind: 'mean_index_points',
      signed: true,
      dayExposure: masked,
      gates,
      estimate:
        passed && observed
          ? {
              point: observed.point,
              statistic: (dayOrder, offset) => {
                const result = meanDeviationDifference(
                  restricted,
                  masked,
                  dayOrder,
                  offset
                );
                return result === null ? null : result.point;
              },
              exposed: {
                n: observed.exposedDays,
                distinctDays: exposedDays,
                runs: countRuns(Array.from(masked, (v) => v === 1)),
                notable: null,
                mean: observed.exposedMean,
              },
              unexposed: {
                n: observed.unexposedDays,
                notable: null,
                mean: observed.unexposedMean,
              },
            }
          : null,
      secondary: null,
      attributionBias: null,
      doseResponse: null,
      sensitivityPoint: null,
    });
  }

  // The weekday question, as one omnibus hypothesis.
  const { range } = weekdayRange(facts.days, arena.outcome, arena.usable);
  out.push({
    key: WEEKDAY_SPEC_KEY,
    labelDe: 'Wochentag',
    family: 'confounder',
    model: 'ra_next_day',
    window: null,
    measurementBasis: 'self_reported',
    effectKind: 'mean_index_points',
    signed: false,
    dayExposure: new Uint8Array(arena.nDays),
    gates: globalGates,
    estimate: globalOk
      ? {
          point: range,
          statistic: (dayOrder, offset) => {
            const { range: value } = weekdayRange(
              facts.days,
              arena.outcome,
              arena.usable,
              dayOrder,
              offset
            );
            return value;
          },
          exposed: { n: 0, distinctDays: 0, runs: 0, notable: null, mean: null },
          unexposed: { n: 0, notable: null, mean: null },
        }
      : null,
    secondary: null,
    attributionBias: null,
    doseResponse: null,
    sensitivityPoint: null,
  });

  return out;
}

function allDays(n: number): Int32Array {
  const out = new Int32Array(n);
  for (let i = 0; i < n; i++) out[i] = i;
  return out;
}

function countExposedDays(arena: MealArena, series: MealTagSeries | null): number {
  if (!series) return 0;
  let count = 0;
  for (let d = 0; d < arena.nDays; d++) {
    const from = arena.dayStart[d];
    const to = arena.dayStart[d + 1];
    for (let i = from; i < to; i++) {
      if (arena.eligible[i] && series.exposed[i]) {
        count++;
        break;
      }
    }
  }
  return count;
}

/**
 * The shrunken effect: the interval bound nearest zero, or zero when the
 * interval spans it.
 *
 * This is what stops a huge point estimate with a huge interval from
 * outranking a modest, well-determined one. A ranking sorted on the raw point
 * estimate would put the noisiest tags on top, which is the opposite of useful.
 */
function shrunkEffect(effect: AnalysisFinding['effect']): number {
  if (!effect) return 0;
  if (effect.ciLow > 0) return effect.ciLow;
  if (effect.ciHigh < 0) return effect.ciHigh;
  return 0;
}

function classify(
  candidate: Candidate,
  effect: AnalysisFinding['effect'],
  qValue: number | null,
  alpha: number
): FindingLabel {
  if (!candidate.estimate || !effect || qValue === null) return 'not_yet';
  if (!candidate.signed) {
    // A range cannot exclude zero, so q carries the whole decision.
    if (qValue <= alpha) return 'clear';
    if (qValue <= POSSIBLE_Q) return 'possible';
    return 'no_signal';
  }
  const excludesZero = effect.ciLow > 0 || effect.ciHigh < 0;
  if (qValue <= alpha && excludesZero) return 'clear';
  if (qValue <= POSSIBLE_Q || excludesZero) return 'possible';
  return 'no_signal';
}

function attachCollinearity(
  findings: AnalysisFinding[],
  candidates: readonly Candidate[],
  facts: Facts
): void {
  const vectors: Record<string, boolean[]> = {};
  const labels = new Map<string, string>();
  for (const candidate of candidates) {
    if (candidate.family !== 'food_tag') continue;
    vectors[candidate.key] = Array.from(candidate.dayExposure, (v) => v === 1);
    labels.set(candidate.key, candidate.labelDe);
  }

  const overlaps = collinearity(vectors, COLLINEARITY_THRESHOLD);
  for (const finding of findings) {
    const pairs = overlaps[finding.key];
    if (!pairs) continue;
    finding.collinearWith = pairs.map((pair) => ({
      key: pair.key,
      labelDe: labels.get(pair.key) ?? pair.key,
      jaccard: pair.jaccard,
    }));
  }
  void facts;
}

/**
 * Rank within each unit, not across them.
 *
 * Model A is in percentage points and Model B in index points; a single ordered
 * list would be comparing two different things. The UI groups by unit for the
 * same reason.
 */
function rankWithinUnits(findings: AnalysisFinding[]): void {
  for (const kind of ['risk_difference_pp', 'mean_index_points'] as EffectKind[]) {
    const group = findings
      .filter((f) => f.status === 'tested' && f.effect?.kind === kind)
      .sort((a, b) => b.sortScore - a.sortScore || (a.qValue ?? 1) - (b.qValue ?? 1));
    group.forEach((finding, index) => {
      finding.rank = index + 1;
    });
  }
}

/**
 * Three-level dose response, descriptive only.
 *
 * Not tested, and that is deliberate: for these seven substances the binary
 * exposure is ALREADY measurement-based (the `bls_measured` rule is what
 * assigned the tag), so testing the dose as well would be a second hypothesis
 * about the same measurement. A monotone staircase is the most convincing thing
 * a person can look at, and here it costs no multiplicity at all.
 */
function doseResponseForMeals(
  facts: Facts,
  arena: MealArena,
  series: MealTagSeries,
  tag: TagDefRow
): AnalysisFinding['doseResponse'] {
  if (!MEASURED_FIELD_BY_TAG[tag.key]) return null;

  const doses: number[] = [];
  for (const meal of facts.meals) {
    const dose = meal.doseByTagKey[tag.key];
    if (dose && dose > 0) doses.push(dose);
  }
  if (doses.length < 10) return null;
  const cut = quantile(doses, 0.5);
  if (cut === null) return null;

  const buckets = {
    none: { n: 0, notable: 0 },
    lower: { n: 0, notable: 0 },
    upper: { n: 0, notable: 0 },
  };

  const ordered = [...facts.meals].sort(
    (a, b) => a.dayIndex - b.dayIndex || a.occurredAt.getTime() - b.occurredAt.getTime()
  );
  ordered.forEach((meal, i) => {
    if (!arena.eligible[i]) return;
    const dose = meal.doseByTagKey[tag.key] ?? 0;
    const level = dose <= 0 ? 'none' : dose <= cut ? 'lower' : 'upper';
    buckets[level].n++;
    buckets[level].notable += series.notable[i];
  });

  return (['none', 'lower', 'upper'] as const).map((level) => ({
    level,
    n: buckets[level].n,
    notable: buckets[level].notable,
    mean: buckets[level].n === 0 ? null : buckets[level].notable / buckets[level].n,
  }));
}

function doseResponseForDays(
  facts: Facts,
  arena: DayArena,
  exposed: Uint8Array,
  tag: TagDefRow
): AnalysisFinding['doseResponse'] {
  if (!MEASURED_FIELD_BY_TAG[tag.key]) return null;

  const doses = facts.days
    .map((d) => d.doseByTagKey[tag.key] ?? 0)
    .filter((v) => v > 0);
  if (doses.length < 10) return null;
  const cut = quantile(doses, 0.5);
  if (cut === null) return null;

  const buckets = {
    none: [] as number[],
    lower: [] as number[],
    upper: [] as number[],
  };

  for (let d = 0; d < arena.nDays; d++) {
    if (!arena.usable[d]) continue;
    const value = arena.outcome[d];
    if (!Number.isFinite(value)) continue;
    const dose = facts.days[d].doseByTagKey[tag.key] ?? 0;
    const level = dose <= 0 ? 'none' : dose <= cut ? 'lower' : 'upper';
    buckets[level].push(value);
  }
  void exposed;

  return (['none', 'lower', 'upper'] as const).map((level) => {
    const values = buckets[level];
    let sum = 0;
    for (const v of values) sum += v;
    return {
      level,
      n: values.length,
      notable: null,
      mean: values.length === 0 ? null : sum / values.length,
    };
  });
}

/**
 * How often the clock-derived window matches the lag she asserted herself.
 *
 * A data-quality figure, not an input to any estimate. While meal times were
 * entry times this rate is low, which is the most honest available signal of
 * how much the early history can carry.
 */
function windowAgreement(facts: Facts): number | null {
  let matched = 0;
  let total = 0;
  const mealById = new Map(facts.meals.map((m) => [m.id, m]));
  for (const symptom of facts.symptoms) {
    if (!symptom.explicitMealId || !symptom.assertedLag) continue;
    const meal = mealById.get(symptom.explicitMealId);
    if (!meal) continue;
    total++;
    const minutes =
      (symptom.occurredAt.getTime() - meal.occurredAt.getTime()) / 60_000;
    const window = ONSET_LAG_MINUTES[symptom.assertedLag];
    const upper = window.toMinutes ?? Number.POSITIVE_INFINITY;
    if (minutes >= window.fromMinutes && minutes < upper) matched++;
  }
  return total === 0 ? null : matched / total;
}
