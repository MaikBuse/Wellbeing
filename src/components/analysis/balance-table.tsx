import { Card, CardHeader, CardMeta, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/chart/data-table';
import { NOTABLE_IMBALANCE } from '@/services/analysis/balance';
import {
  BALANCE_NOTE_LABELS,
  SEPARATED_NOTICE,
  formatImbalance,
} from '@/services/analysis/labels';
import { formatGermanNumber } from '@/lib/nutrition';
import type { AnalysisFinding } from '@/services/analysis/types';

/**
 * Exposed against unexposed, side by side.
 *
 * This is here instead of covariate adjustment, and that is a deliberate trade.
 * With a few hundred days and perhaps thirty exposed ones, a regression with
 * seven covariates produces a number nobody can check. A balance table says
 * which other factor moved with this one — which is both honest and exactly the
 * thing the question "what should I change" needs to know.
 */
export function BalanceTable({ finding }: { finding: AnalysisFinding }) {
  const rows = finding.balance.filter(
    (row) => row.exposedMean !== null || row.unexposedMean !== null
  );
  if (rows.length === 0) return null;

  const notable = rows
    .filter(
      (row) =>
        row.standardisedDiff !== null &&
        Math.abs(row.standardisedDiff) >= NOTABLE_IMBALANCE
    )
    .sort(
      (a, b) =>
        Math.abs(b.standardisedDiff ?? 0) - Math.abs(a.standardisedDiff ?? 0)
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Was noch anders war</CardTitle>
        <CardMeta>
          An den Tagen mit diesem Faktor, verglichen mit den Tagen ohne.
        </CardMeta>
      </CardHeader>

      {notable.length > 0 ? (
        <p className="mb-3 text-sm text-primary-strong">
          {notable[0].note === 'separated'
            ? SEPARATED_NOTICE
            : formatImbalance(finding.labelDe, notable[0].labelDe)}
        </p>
      ) : null}

      <DataTable
        caption="Vergleich der beiden Gruppen"
        columns={[
          { key: 'label', label: '', render: (row) => row.labelDe },
          {
            key: 'exposed',
            label: 'mit',
            align: 'right',
            render: (row) =>
              row.exposedMean === null
                ? '–'
                : formatGermanNumber(round(row.exposedMean)),
          },
          {
            key: 'unexposed',
            label: 'ohne',
            align: 'right',
            render: (row) =>
              row.unexposedMean === null
                ? '–'
                : formatGermanNumber(round(row.unexposedMean)),
          },
          {
            key: 'diff',
            label: 'Unterschied',
            align: 'right',
            render: (row) =>
              row.standardisedDiff !== null
                ? formatGermanNumber(round(row.standardisedDiff))
                : row.note
                  ? BALANCE_NOTE_LABELS[row.note]
                  : '–',
          },
          {
            // A row computed from one observation against two hundred has to
            // say so; without this it looked like any other row.
            key: 'n',
            label: 'Fälle',
            align: 'right',
            render: (row) => `${row.exposedN} / ${row.unexposedN}`,
          },
        ]}
        rows={rows}
        rowKey={(row) => row.key}
      />
    </Card>
  );
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
