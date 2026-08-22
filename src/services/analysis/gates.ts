/**
 * Case-count gates.
 *
 * A gate that fails is SHOWN, never hidden. "Laktose — noch nicht auswertbar,
 * es fehlen noch 14 Tage" is more useful than silence: it tells her exactly
 * what to record more of, and it stops the ranking from implying that an absent
 * factor is an innocent one.
 *
 * Two of these are the ones people forget, and both guard against the same
 * mistake — treating clustered observations as independent ones.
 */
export type GateResult = {
  gate: string;
  have: number;
  need: number;
  passed: boolean;
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

export function gate(name: string, have: number, need: number): GateResult {
  return { gate: name, have, need, passed: have >= need };
}

export function gateLabel(name: string): string {
  return GATE_LABELS[name] ?? name;
}

export function allPassed(gates: readonly GateResult[]): boolean {
  return gates.every((g) => g.passed);
}

/** The single largest shortfall, for the "noch nicht auswertbar" copy. */
export function largestShortfall(
  gates: readonly GateResult[]
): GateResult | null {
  const failed = gates.filter((g) => !g.passed);
  if (failed.length === 0) return null;
  return failed.reduce((worst, current) =>
    current.need - current.have > worst.need - worst.have ? current : worst
  );
}
