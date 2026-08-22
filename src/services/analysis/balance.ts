/**
 * The balance table: how unalike the exposed and unexposed days are.
 *
 * This replaces covariate adjustment, deliberately. With a few hundred days and
 * perhaps thirty exposed ones, a multivariable model with seven covariates is
 * not an analysis — it is a random-number generator with error bars. A balance
 * table is more honest AND more useful: it says which OTHER factor is entangled
 * with this one, which is exactly the question "what should I change" needs.
 */
import { mean, standardisedDiff } from '@/lib/stats/summary';
import type { DailyFact } from './facts';

export type BalanceRow = {
  key: string;
  labelDe: string;
  exposedMean: number | null;
  unexposedMean: number | null;
  standardisedDiff: number | null;
  /** Observations behind each mean. A row from 1 against 200 must say so. */
  exposedN: number;
  unexposedN: number;
  /**
   * Why there is no standardised difference, when there is none.
   *
   * `separated` is the important one and it was invisible: with no variation in
   * either arm but different means — the exposed days ALL flares and the
   * unexposed days none — the pooled spread is zero, the old code returned null,
   * and the table printed "–". That is the most extreme imbalance expressible,
   * and it was rendering as "no data" while the warning sentence never fired.
   */
  note: 'no_variation' | 'separated' | null;
};

/** Above this, the imbalance is called out in words rather than left in a table. */
export const NOTABLE_IMBALANCE = 0.4;

type Extractor = { key: string; labelDe: string; value: (day: DailyFact) => number | null };

const EXTRACTORS: Extractor[] = [
  { key: 'sleepMinutes', labelDe: 'Schlafdauer (Min)', value: (d) => d.sleepMinutes },
  { key: 'sleepQuality', labelDe: 'Schlafqualität', value: (d) => d.sleepQuality },
  { key: 'stress', labelDe: 'Stress', value: (d) => d.stress },
  { key: 'activityMinutes', labelDe: 'Bewegung (Min)', value: (d) => d.activityMinutes },
  { key: 'steroidMg', labelDe: 'Kortison (mg)', value: (d) => d.steroidMgPredEq },
  { key: 'isFlare', labelDe: 'Schubtage (Anteil)', value: (d) => (d.isFlare ? 1 : 0) },
  {
    key: 'perimenstrual',
    labelDe: 'Tage um die Periode (Anteil)',
    value: (d) => (d.perimenstrual === null ? null : d.perimenstrual ? 1 : 0),
  },
  {
    key: 'dmardAdherence',
    labelDe: 'Basistherapie-Adhärenz',
    value: (d) => d.dmardAdherence7d,
  },
];

export function balanceTable(
  days: readonly DailyFact[],
  exposed: Uint8Array,
  usable: Uint8Array
): BalanceRow[] {
  return EXTRACTORS.map((extractor) => {
    const exposedValues: number[] = [];
    const unexposedValues: number[] = [];
    for (let d = 0; d < days.length; d++) {
      if (!usable[d]) continue;
      const value = extractor.value(days[d]);
      if (value === null) continue;
      (exposed[d] ? exposedValues : unexposedValues).push(value);
    }
    const exposedMean = mean(exposedValues);
    const unexposedMean = mean(unexposedValues);
    const diff = standardisedDiff(exposedValues, unexposedValues);

    let note: BalanceRow['note'] = null;
    if (diff === null && exposedMean !== null && unexposedMean !== null) {
      note = exposedMean === unexposedMean ? 'no_variation' : 'separated';
    }

    return {
      key: extractor.key,
      labelDe: extractor.labelDe,
      exposedMean,
      unexposedMean,
      standardisedDiff: diff,
      exposedN: exposedValues.length,
      unexposedN: unexposedValues.length,
      note,
    };
  });
}

/**
 * The rows worth saying out loud, worst first.
 *
 * A fully separated row counts as maximally imbalanced — it used to be filtered
 * out for having no standardised difference, which silenced the warning in
 * exactly the case that most deserved it.
 */
export function notableImbalances(rows: readonly BalanceRow[]): BalanceRow[] {
  return rows
    .filter(
      (row) =>
        row.note === 'separated' ||
        (row.standardisedDiff !== null &&
          Math.abs(row.standardisedDiff) >= NOTABLE_IMBALANCE)
    )
    .sort((a, b) => severity(b) - severity(a));
}

function severity(row: BalanceRow): number {
  if (row.note === 'separated') return Number.POSITIVE_INFINITY;
  return Math.abs(row.standardisedDiff ?? 0);
}
