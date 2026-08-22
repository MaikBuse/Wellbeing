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
    return {
      key: extractor.key,
      labelDe: extractor.labelDe,
      exposedMean: mean(exposedValues),
      unexposedMean: mean(unexposedValues),
      standardisedDiff: standardisedDiff(exposedValues, unexposedValues),
    };
  });
}

/** The rows worth saying out loud, worst first. */
export function notableImbalances(rows: readonly BalanceRow[]): BalanceRow[] {
  return rows
    .filter(
      (row) =>
        row.standardisedDiff !== null &&
        Math.abs(row.standardisedDiff) >= NOTABLE_IMBALANCE
    )
    .sort(
      (a, b) => Math.abs(b.standardisedDiff ?? 0) - Math.abs(a.standardisedDiff ?? 0)
    );
}
