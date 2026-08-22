/**
 * Case-count gates.
 *
 * These no longer decide VISIBILITY. Every factor that can be estimated at all
 * is shown from the first day; what the gates decide is whether a factor may be
 * called `confirmatory` — whether it earns a p-value, a q-value, a verdict, a
 * rank and a place in the stability streak.
 *
 * Below the gates a factor is `provisional`: the effect and its interval are
 * shown, together with a reliability indicator built from these same numbers.
 * That split is what lets the screen be useful on day one without the
 * multiple-comparison correction being computed over three dozen underpowered
 * tests, which would bury the real findings.
 *
 * Two of these are the ones people forget, and both guard against the same
 * mistake — treating clustered observations as independent ones.
 */
export type GateResult = {
  gate: string;
  have: number;
  need: number;
  passed: boolean;
  /**
   * `global` gates are identical for every factor in a run.
   *
   * They must be kept OUT of the per-factor reliability score. `trackedDays` and
   * `daysWithRaIndex` are the same numbers for all 42 factors, so a `min` that
   * includes them collapses to one app-wide value wearing a per-factor costume —
   * every factor at the same level for the first sixty days, and a sort key that
   * discriminates nothing exactly when the feature is meant to be useful. They
   * are shown once, in the banner, and they still decide `confirmatory`.
   */
  scope: 'factor' | 'global';
};

export const MODEL_A_GATES = {
  exposedMeals: 30,
  unexposedMeals: 60,
  /**
   * Forty exposed meals inside one week is ONE observation of a week of bread,
   * not forty. Without this a single fortnight of a new habit can look like a
   * well-powered comparison.
   */
  exposedDistinctDays: 12,
  /**
   * Without this, "0 of 40 versus 0 of 200" produces a risk difference of
   * exactly 0 with a tight interval — which reads as a confident null when it
   * is really an absence of data.
   */
  notableReactionsTotal: 8,
} as const;

export const MODEL_B_GATES = {
  exposedDays: 25,
  unexposedDays: 25,
  /** The day-level twin of `exposedDistinctDays`: maximal runs, not days. */
  exposedRuns: 6,
  exposedDaysWithOutcome: 15,
  unexposedDaysWithOutcome: 15,
} as const;

export const GLOBAL_GATES = {
  trackedDays: 60,
  daysWithRaIndex: 45,
} as const;

/**
 * German labels for the gates.
 *
 * Here rather than on the stored finding, for the reason `scales.ts` already
 * gives for the severity labels: they are presentation. Writing them into
 * `analysis_run.results` would freeze this month's wording into every past run
 * and make a copy fix a data migration.
 */
const GATE_LABELS: Record<string, string> = {
  exposedMeals: 'Mahlzeiten mit diesem Merkmal',
  unexposedMeals: 'Mahlzeiten ohne dieses Merkmal',
  exposedDistinctDays: 'verschiedene Tage mit diesem Merkmal',
  notableReactionsTotal: 'merkliche Reaktionen insgesamt',
  exposedDays: 'Tage mit diesem Merkmal',
  unexposedDays: 'Tage ohne dieses Merkmal',
  exposedRuns: 'getrennte Zeitabschnitte mit diesem Merkmal',
  exposedDaysWithOutcome: 'Tage mit Merkmal und Folgetagswert',
  unexposedDaysWithOutcome: 'Tage ohne Merkmal und mit Folgetagswert',
  trackedDays: 'erfasste Tage',
  daysWithRaIndex: 'Tage mit RA-Tageswert',
};

export function gate(
  name: string,
  have: number,
  need: number,
  scope: 'factor' | 'global' = 'factor'
): GateResult {
  return { gate: name, have, need, passed: have >= need, scope };
}

export function factorGates(gates: readonly GateResult[]): GateResult[] {
  return gates.filter((g) => g.scope === 'factor');
}

export function gateLabel(name: string): string {
  return GATE_LABELS[name] ?? name;
}

export function allPassed(gates: readonly GateResult[]): boolean {
  return gates.every((g) => g.passed);
}

/**
 * The gate that caps the reliability score — the one with the smallest
 * `have / need`.
 *
 * Deliberately RELATIVE, not absolute. 38 of 60 tracked days is a shortfall of
 * 22 but a ratio of 0.63; 12 of 30 meals is a shortfall of 18 but a ratio of
 * 0.40. The second is what actually holds the factor back, so naming the first
 * would send her off recording the wrong thing.
 */
export function bindingGate(gates: readonly GateResult[]): GateResult | null {
  const failed = gates.filter((g) => !g.passed);
  if (failed.length === 0) return null;
  return failed.reduce((worst, current) => {
    const d = ratio(current) - ratio(worst);
    // Ties are common — a never-eaten factor is 0/30 AND 0/12 — so break them
    // explicitly by name rather than letting `reduce` silently keep the first.
    if (d < 0) return current;
    if (d > 0) return worst;
    return current.gate < worst.gate ? current : worst;
  });
}

/**
 * Gates that are NOT a request to record more of something.
 *
 * `notableReactionsTotal` is an outcome, not an action: naming it as the binding
 * gate produces "es fehlen noch 8 merkliche Reaktionen" — telling someone with
 * RA that she needs eight more flare-ups. That is the one sentence this feature
 * must never generate. The unexposed counts are excluded for a milder version of
 * the same problem: their only "action" is *eat this less*, which needs
 * different wording from *record more*.
 *
 * They stay in the gate table and in the reliability score. They are only kept
 * out of the imperative copy.
 */
const NOT_ACTIONABLE = new Set([
  'notableReactionsTotal',
  'unexposedMeals',
  'unexposedDays',
  'unexposedDaysWithOutcome',
]);

/** The gate to name in "what to record more of". May be null. */
export function actionableBindingGate(
  gates: readonly GateResult[]
): GateResult | null {
  return bindingGate(gates.filter((g) => !NOT_ACTIONABLE.has(g.gate)));
}

function ratio(g: GateResult): number {
  if (g.need <= 0) return 1;
  return Math.min(1, Math.max(0, g.have / g.need));
}

/** 4 = every gate met. Below that, three coarse steps. */
export type ReliabilityLevel = 1 | 2 | 3 | 4;

export type Reliability = {
  /** min over the gates of have/need, clamped to [0, 1]. */
  sufficiency: number;
  level: ReliabilityLevel;
  /** The gate to name as "what to record more of", or null when nothing is short. */
  bindingGate: string | null;
  gatesMet: number;
  gatesTotal: number;
};

export const RELIABILITY_THRESHOLDS = { level3: 0.6, level2: 0.3 } as const;

/**
 * How much of the required data is actually there.
 *
 * The weakest link, not an average: a factor with plenty of unexposed meals and
 * almost no exposed ones is limited by the exposed arm, and averaging would
 * hide that behind the arm that is fine. It is also the number she can act on —
 * `bindingGate` says which one to feed.
 *
 * Deliberately NOT the interval width. The width is already printed next to the
 * effect, so a second indicator saying the same thing differently helps nobody,
 * and it would not tell her what to do about it.
 */
export function reliability(all: readonly GateResult[]): Reliability {
  const gates = factorGates(all);
  if (gates.length === 0) {
    return { sufficiency: 1, level: 4, bindingGate: null, gatesMet: 0, gatesTotal: 0 };
  }

  let sufficiency = 1;
  for (const g of gates) sufficiency = Math.min(sufficiency, ratio(g));

  const binding = actionableBindingGate(gates) ?? bindingGate(gates);
  const level: ReliabilityLevel =
    binding === null
      ? 4
      : sufficiency >= RELIABILITY_THRESHOLDS.level3
        ? 3
        : sufficiency >= RELIABILITY_THRESHOLDS.level2
          ? 2
          : 1;

  return {
    sufficiency,
    level,
    bindingGate: binding?.gate ?? null,
    // How many requirements are already satisfied — a fact `min` cannot carry.
    // "1 von 4 erfüllt" and "3 von 4 erfüllt" can share the same weakest link,
    // and they are very different situations to be in. Reported alongside rather
    // than folded in, because a composite would stop being invertible into an
    // action and that is the whole reason `min` was chosen.
    gatesMet: gates.filter((g) => g.passed).length,
    gatesTotal: gates.length,
  };
}

/**
 * The gates that decide whether a bootstrap interval is meaningful at all.
 *
 * This is not a reliability threshold, it is a validity one. The day-block
 * bootstrap resamples DAYS, and both statistics are scale-invariant within an
 * arm: drawing one exposed day k times leaves `notable/meals` and `mean()`
 * unchanged. An arm supported by a single day therefore contributes EXACTLY
 * ZERO bootstrap variance, and the interval silently reports the precision of
 * the other arm — measured at 2.5 percentage points wide from one meal, and
 * excluding zero in 100 % of null datasets.
 *
 * There is no threshold on interval width that separates "narrow because well
 * determined" from "narrow because one arm cannot move". So the arm-support
 * gates — which already exist, and whose thresholds sit exactly where the
 * measured false-exclusion rate bottoms out — are what an interval waits for.
 */
export const INTERVAL_SUPPORT_GATES = new Set([
  'exposedDistinctDays',
  'exposedRuns',
  'exposedDaysWithOutcome',
]);

export function intervalIsSupported(gates: readonly GateResult[]): boolean {
  const relevant = gates.filter((g) => INTERVAL_SUPPORT_GATES.has(g.gate));
  return relevant.length > 0 && relevant.every((g) => g.passed);
}

/**
 * The percentile bootstrap needs enough independent blocks to have tails.
 *
 * At 10 days with a 28-day block there are 1.27 blocks per resample and 95 %
 * day coverage — each draw is essentially a rotation of the whole series, and
 * both tail percentiles are set by a single block. Four blocks is the floor at
 * which the interval has any resolution at all.
 */
export const MIN_BLOCKS_FOR_INTERVAL = 4;

export function hasEnoughBlocks(nDays: number, blockLength: number): boolean {
  return nDays >= MIN_BLOCKS_FOR_INTERVAL * blockLength;
}
