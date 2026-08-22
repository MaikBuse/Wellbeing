/**
 * The stored shape of an analysis run.
 *
 * `analysis_run.params` is `Record<string, unknown>` and `results` is
 * `unknown[]` at the Drizzle level, so the contract lives here — and it is
 * enforced with a zod parse ON READ. A run written by an older version of this
 * code must never crash the page: a parse failure is treated as "no run yet"
 * and the UI offers to recompute.
 *
 * Everything that could change an answer goes into `params`. That is what makes
 * a stored run interpretable a month later, and it is why the PRNG seed, the
 * gates, the weights and the catalog version are all in here rather than being
 * implicit in the code that produced them.
 */
import { z } from 'zod';
import type { LogDate } from '@/lib/time';
import type { OnsetLagKey, RaComponent } from '@/lib/scales';

export const ANALYSIS_KIND_SUSPICION = 'suspicion_ranking';

/**
 * Bump when anything that changes a number changes: a weight, a gate, a
 * statistic, a window. The stability indicator refuses to chain across a bump,
 * because "top for three weeks" must not span a change in the meaning of "top".
 */
export const ALGORITHM_VERSION = 1;

export type TagConfidence = 'certain' | 'likely' | 'trace';
export type SymptomGroupKey = 'gi' | 'systemic' | 'msk' | 'skin' | 'airway' | 'other';
export type CyclePhase = 'menstrual' | 'follicular' | 'luteal' | 'unknown';
export type SteroidStep = 'none' | 'low' | 'medium' | 'high';

export type AnalysisFamily = 'food_tag' | 'confounder';
export type AnalysisModel = 'meal_reaction' | 'ra_next_day';
export type FindingLabel = 'clear' | 'possible' | 'no_signal' | 'not_yet';
export type EffectKind = 'risk_difference_pp' | 'mean_index_points';

/** How the exposure for this factor was established. Shown as a badge. */
export type MeasurementBasis = 'measured' | 'rule' | 'self_reported';

const logDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const analysisParamsSchema = z.object({
  algorithmVersion: z.number().int(),
  seed: z.string(),
  range: z.object({ from: logDateSchema, to: logDateSchema }),
  timeZone: z.string(),
  dayStartHour: z.number().int(),

  countTraceExposure: z.boolean(),
  confidencesCounted: z.array(z.enum(['certain', 'likely', 'trace'])),
  trackedDayRule: z.string(),

  raIndex: z.object({
    weights: z.record(z.string(), z.number()),
    minWeightCoverage: z.number(),
    requireCore: z.boolean(),
    /** See the daily-log relabel: the chips read as severity, so higher = worse. */
    complaintsPolarity: z.enum(['severity', 'inverted']),
  }),

  baseline: z.object({
    windowDays: z.number().int(),
    minCoverageDays: z.number().int(),
    align: z.literal('trailing_exclusive'),
  }),

  bootstrap: z.object({
    kind: z.literal('stationary_circular'),
    resamples: z.number().int(),
    expectedBlockLength: z.number(),
    acfLagUsed: z.number().nullable(),
  }),

  permutation: z.object({
    kind: z.literal('circular_rotation'),
    resamples: z.number().int(),
  }),

  fdr: z.object({
    procedure: z.literal('benjamini_hochberg'),
    alpha: z.number(),
    families: z.record(z.string(), z.object({ m: z.number().int() })),
  }),

  modelA: z.object({
    notableThreshold: z.number(),
    symptomGroups: z.array(z.string()),
    attribution: z.literal('time_window'),
    windows: z.record(
      z.string(),
      z.object({ fromMinutes: z.number(), toMinutes: z.number().nullable() })
    ),
  }),

  modelB: z.object({
    stratifyBy: z.literal('steroid_step'),
    flarePolicy: z.literal('exclude_outcome'),
  }),

  gates: z.record(z.string(), z.number()),

  exclusions: z.object({
    protocolDays: z.number().int(),
    flareDaysExcluded: z.number().int(),
    untrackedDaysExcluded: z.number().int(),
  }),

  counts: z.object({
    rangeDays: z.number().int(),
    trackedDays: z.number().int(),
    daysWithRaIndex: z.number().int(),
    daysWithOutcome: z.number().int(),
    meals: z.number().int(),
    symptomEntries: z.number().int(),
    /** Share of grams from BLS-linked foods — gates the dose panel. */
    blsGramsShare: z.number(),
    /** Share of grams where an amount was actually stated. */
    portionEvidenceShare: z.number(),
    /** Agreement between the derived window and her asserted onset lag. */
    windowAgreementRate: z.number().nullable(),
  }),

  /** The BLS catalog state, because the measured doses are joined, not frozen. */
  catalog: z.object({
    rowCount: z.number().int(),
    maxUpdatedAt: z.string().nullable(),
  }),

  steroidFactorAssumed: z.boolean(),
  exploratoryCrossModel: z.boolean(),
});

export type AnalysisParams = z.infer<typeof analysisParamsSchema>;

const gateSchema = z.object({
  gate: z.string(),
  have: z.number(),
  need: z.number(),
  passed: z.boolean(),
});

const effectSchema = z.object({
  kind: z.enum(['risk_difference_pp', 'mean_index_points']),
  point: z.number(),
  ciLow: z.number(),
  ciHigh: z.number(),
});

export const analysisFindingSchema = z.object({
  family: z.enum(['food_tag', 'confounder']),
  model: z.enum(['meal_reaction', 'ra_next_day']),
  key: z.string(),
  labelDe: z.string(),
  window: z.string().nullable(),
  measurementBasis: z.enum(['measured', 'rule', 'self_reported']),

  status: z.enum(['tested', 'not_yet']),
  label: z.enum(['clear', 'possible', 'no_signal', 'not_yet']),

  effect: effectSchema.nullable(),
  evidenceStrength: z.number(),
  sortScore: z.number(),
  rank: z.number().int().nullable(),
  pValue: z.number().nullable(),
  qValue: z.number().nullable(),

  exposed: z.object({
    n: z.number().int(),
    distinctDays: z.number().int(),
    runs: z.number().int(),
    notable: z.number().int().nullable(),
    mean: z.number().nullable(),
  }),
  unexposed: z.object({
    n: z.number().int(),
    notable: z.number().int().nullable(),
    mean: z.number().nullable(),
  }),

  secondary: z
    .object({
      probabilityOfSuperiority: z.number().nullable(),
      meanSeverityDiff: z.number().nullable(),
      perComponent: z.record(z.string(), z.number()).nullable(),
    })
    .nullable(),

  /** Three-level dose response, descriptive only. Null when not measurable. */
  doseResponse: z
    .array(
      z.object({
        level: z.enum(['none', 'lower', 'upper']),
        n: z.number().int(),
        notable: z.number().int().nullable(),
        mean: z.number().nullable(),
      })
    )
    .nullable(),

  balance: z.array(
    z.object({
      key: z.string(),
      labelDe: z.string(),
      exposedMean: z.number().nullable(),
      unexposedMean: z.number().nullable(),
      standardisedDiff: z.number().nullable(),
    })
  ),

  collinearWith: z.array(
    z.object({ key: z.string(), labelDe: z.string(), jaccard: z.number() })
  ),

  attributionBias: z
    .object({
      explicitLinkRateExposed: z.number(),
      explicitLinkRateUnexposed: z.number(),
    })
    .nullable(),

  sensitivity: z.object({ flareKept: effectSchema.nullable() }).nullable(),

  gates: z.array(gateSchema),

  stability: z.object({
    weeksInTopFive: z.number().int(),
    previousRank: z.number().int().nullable(),
  }),
});

export type AnalysisFinding = z.infer<typeof analysisFindingSchema>;

export const analysisResultsSchema = z.array(analysisFindingSchema);
export type AnalysisResults = z.infer<typeof analysisResultsSchema>;

export type { LogDate, OnsetLagKey, RaComponent };
