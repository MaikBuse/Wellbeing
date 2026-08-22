/**
 * The one impure file in this directory: it reads the database, hands plain
 * data to the pure pipeline, and writes the run back.
 *
 * It lives in `services/` rather than in the action for the same reason
 * `services/food/fromCatalog.ts` does: a Server Action cannot be called outside
 * a request scope, because `requireUserForAction()` reads headers, and
 * `db:check` has to exercise this against a real Postgres. The action stays the
 * authentication boundary and passes the user id in. Nothing here
 * authenticates anything, so nothing here may be reachable from a route.
 */
import {
  analysedTagDefs,
  catalogState,
  dailyLogRange,
  insertRun,
  intakeRange,
  mealMeasuredRange,
  mealRange,
  mealTagExposureRange,
  menstrualEventRange,
  protocolDayIntervals,
  recentRuns,
  scheduleVersionsRange,
  symptomEntryRange,
  type MedCategory,
} from '@/db/queries/analysis';
import { getUserSettings } from '@/db/queries/users';
import { addDays, todayLogDate, type LogDate } from '@/lib/time';
import { DMARD_CATEGORIES } from './adherence';
import { assembleFacts, type FactsInput } from './facts';
import { computeSuspicionRanking } from './run';
import { computeStability } from './stability';
import {
  ALGORITHM_VERSION,
  ANALYSIS_KIND_SUSPICION,
  analysisResultsSchema,
  type AnalysisFinding,
  type AnalysisParams,
} from './types';
import type { SteroidMedication } from './steroid';

/** Default window. Long enough for the day gates, short enough to stay honest. */
export const DEFAULT_RANGE_DAYS = 180;
/** Cycle events must be read from before the range or the first weeks have no phase. */
const CYCLE_LOOKBACK_DAYS = 45;

export type RunForUserOptions = {
  from?: LogDate;
  to?: LogDate;
  /**
   * Window length, as an alternative to `from`.
   *
   * The day arithmetic lives here rather than at the call site because this is
   * where the user's time zone and `dayStartHour` are known — and CLAUDE.md is
   * explicit that a client must never work out a logical day for itself.
   */
  days?: number;
  bootstrapResamples?: number;
  rotationResamples?: number;
  /** Injected in tests so a run does not depend on the wall clock. */
  now?: Date;
};

export type RunForUserResult = {
  runId: string;
  params: AnalysisParams;
  findings: AnalysisFinding[];
  durationMs: number;
};

export async function runAnalysisForUser(
  userId: string,
  options: RunForUserOptions = {}
): Promise<RunForUserResult> {
  const startedAt = Date.now();
  const settings = await getUserSettings(userId);

  const to =
    options.to ??
    todayLogDate(settings.timeZone, settings.dayStartHour, options.now ?? new Date());
  const windowDays = options.days ?? DEFAULT_RANGE_DAYS;
  const from = options.from ?? addDays(to, -(windowDays - 1));

  const steroidCategories: MedCategory[] = ['steroid'];
  const dmardCategories = [...DMARD_CATEGORIES] as MedCategory[];

  const [
    dailyLogs,
    meals,
    exposures,
    measured,
    symptoms,
    tagDefs,
    steroidSchedules,
    dmardSchedules,
    intakes,
    menstrual,
    protocolIntervals,
    catalog,
    priorRuns,
  ] = await Promise.all([
    dailyLogRange(userId, from, to),
    mealRange(userId, from, to),
    mealTagExposureRange(userId, from, to),
    mealMeasuredRange(userId, from, to),
    symptomEntryRange(userId, from, to),
    analysedTagDefs(),
    scheduleVersionsRange(userId, from, to, steroidCategories),
    scheduleVersionsRange(userId, from, to, dmardCategories),
    intakeRange(userId, from, to),
    menstrualEventRange(userId, addDays(from, -CYCLE_LOOKBACK_DAYS), to),
    protocolDayIntervals(userId, from, to),
    catalogState(),
    recentRuns(userId, ANALYSIS_KIND_SUSPICION, 12),
  ]);

  const steroidMedications = new Map<string, SteroidMedication>();
  for (const schedule of steroidSchedules) {
    steroidMedications.set(schedule.medicationId, {
      id: schedule.medicationId,
      name: schedule.medicationName,
      activeSubstance: schedule.activeSubstance,
    });
  }

  const input: FactsInput = {
    range: { from, to },
    settings: {
      timeZone: settings.timeZone,
      dayStartHour: settings.dayStartHour,
      countTraceExposure: settings.countTraceExposure,
    },
    dailyLogs,
    meals,
    exposures,
    measured,
    symptoms,
    tagDefs,
    steroidSchedules,
    steroidMedications,
    dmardSchedules,
    intakes,
    menstrual,
    protocolIntervals,
  };

  const facts = assembleFacts(input);

  const { params, findings } = computeSuspicionRanking(facts, {
    // Derived, not constant: the same range reproduces every number exactly,
    // while a different week gets independent resampling noise. A fixed seed
    // would make two consecutive runs share their noise, so a pure artefact
    // would persist and be REWARDED by the stability indicator.
    seed: `${userId}:${from}:${to}:v${ALGORITHM_VERSION}`,
    timeZone: settings.timeZone,
    dayStartHour: settings.dayStartHour,
    countTraceExposure: settings.countTraceExposure,
    bootstrapResamples: options.bootstrapResamples,
    rotationResamples: options.rotationResamples,
    catalog,
  });

  const computedAt = options.now ?? new Date();
  const stability = computeStability({
    algorithmVersion: ALGORITHM_VERSION,
    timeZone: settings.timeZone,
    dayStartHour: settings.dayStartHour,
    currentComputedAt: computedAt,
    current: findings.map((f) => ({ key: f.key, rank: f.rank, status: f.status })),
    priorRuns: priorRuns.map((run) => ({
      computedAt: run.computedAt,
      algorithmVersion: Number(
        (run.params as { algorithmVersion?: unknown }).algorithmVersion ?? -1
      ),
      ranks: ranksOf(run.results),
    })),
  });

  for (const finding of findings) {
    const entry = stability.get(finding.key);
    if (entry) finding.stability = entry;
  }

  const durationMs = Date.now() - startedAt;
  const runId = await insertRun({
    userId,
    kind: ANALYSIS_KIND_SUSPICION,
    rangeFrom: from,
    rangeTo: to,
    params,
    results: findings,
    durationMs,
  });

  return { runId, params, findings, durationMs };
}

/**
 * The day series alone, with no statistics run.
 *
 * The overview needs the RA index, its components and the deviation per day;
 * it does not need a bootstrap. Separating the two keeps the page a cheap read
 * — the expensive part is a button press, not a page view.
 */
export async function loadDaySeries(
  userId: string,
  options: { from?: LogDate; to?: LogDate; days?: number; now?: Date } = {}
) {
  const settings = await getUserSettings(userId);
  const to =
    options.to ??
    todayLogDate(settings.timeZone, settings.dayStartHour, options.now ?? new Date());
  const from = options.from ?? addDays(to, -((options.days ?? DEFAULT_RANGE_DAYS) - 1));

  const [
    dailyLogs,
    meals,
    exposures,
    measured,
    symptoms,
    tagDefs,
    steroidSchedules,
    dmardSchedules,
    intakes,
    menstrual,
    protocolIntervals,
  ] = await Promise.all([
    dailyLogRange(userId, from, to),
    mealRange(userId, from, to),
    mealTagExposureRange(userId, from, to),
    mealMeasuredRange(userId, from, to),
    symptomEntryRange(userId, from, to),
    analysedTagDefs(),
    scheduleVersionsRange(userId, from, to, ['steroid']),
    scheduleVersionsRange(userId, from, to, [...DMARD_CATEGORIES] as MedCategory[]),
    intakeRange(userId, from, to),
    menstrualEventRange(userId, addDays(from, -CYCLE_LOOKBACK_DAYS), to),
    protocolDayIntervals(userId, from, to),
  ]);

  const steroidMedications = new Map<string, SteroidMedication>();
  for (const schedule of steroidSchedules) {
    steroidMedications.set(schedule.medicationId, {
      id: schedule.medicationId,
      name: schedule.medicationName,
      activeSubstance: schedule.activeSubstance,
    });
  }

  const facts = assembleFacts({
    range: { from, to },
    settings: {
      timeZone: settings.timeZone,
      dayStartHour: settings.dayStartHour,
      countTraceExposure: settings.countTraceExposure,
    },
    dailyLogs,
    meals,
    exposures,
    measured,
    symptoms,
    tagDefs,
    steroidSchedules,
    steroidMedications,
    dmardSchedules,
    intakes,
    menstrual,
    protocolIntervals,
  });

  return { range: { from, to }, settings, facts };
}

/**
 * Ranks from a stored run.
 *
 * Parsed defensively: a run written by an older version must never crash the
 * page, so an unreadable one contributes no ranks rather than throwing.
 */
function ranksOf(results: unknown[]): Map<string, number | null> {
  const parsed = analysisResultsSchema.safeParse(results);
  if (!parsed.success) return new Map();
  return new Map(parsed.data.map((finding) => [finding.key, finding.rank]));
}
