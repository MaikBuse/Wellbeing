import { ChartFrame } from '@/components/chart/chart-frame';
import { DataTable } from '@/components/chart/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import {
  MIN_BLS_GRAMS_SHARE,
  MIN_PORTION_EVIDENCE_SHARE,
} from '@/services/analysis/exposure';
import {
  DESCRIPTIVE_NOTICE,
  formatDoseGateFailure,
} from '@/services/analysis/labels';
import { rampClassFor } from '@/lib/chart-theme';
import { formatGermanNumber } from '@/lib/nutrition';
import type { AnalysisFinding } from '@/services/analysis/types';

const LEVEL_LABELS = {
  none: 'keine',
  lower: 'wenig',
  upper: 'viel',
} as const;

/**
 * The dose-response panel: three levels, descriptive only.
 *
 * Not tested, on purpose. For the seven substances the BLS actually measures,
 * the binary exposure is ALREADY a measured threshold — the `bls_measured` rule
 * is what assigned the tag — so testing the dose as well would be a second
 * hypothesis about the same measurement. A monotone staircase is the most
 * convincing thing a person can look at, and here it costs no multiplicity.
 *
 * The two gates matter as much as the bars. `food_catalog` carries no portion
 * size, so an untouched BLS entry is exactly 100 g: without stated amounts the
 * "dose" is just the catalogue's per-100 g value, and a curve drawn from that
 * would be a picture of the catalogue rather than of her.
 */
export function DoseResponse({
  finding,
  blsGramsShare,
  portionEvidenceShare,
}: {
  finding: AnalysisFinding;
  blsGramsShare: number;
  portionEvidenceShare: number;
}) {
  if (!finding.doseResponse) return null;

  const measurable = blsGramsShare >= MIN_BLS_GRAMS_SHARE;
  const weighed = portionEvidenceShare >= MIN_PORTION_EVIDENCE_SHARE;

  if (!measurable || !weighed) {
    return (
      <ChartFrame
        title="Menge und Wirkung"
        summary="Für eine Dosis-Aussage reichen die Angaben nicht."
        chart={
          <EmptyState
            title="Menge nicht belastbar"
            description={
              measurable
                ? formatDoseGateFailure(
                    Math.round((1 - portionEvidenceShare) * 100)
                  )
                : `Nur ${Math.round(
                    blsGramsShare * 100
                  )} % der Gramm stammen aus Lebensmitteln mit Messwerten.`
            }
          />
        }
      />
    );
  }

  const rows = finding.doseResponse;
  const max = Math.max(...rows.map((row) => Math.abs(row.mean ?? 0)), 0.0001);

  return (
    <ChartFrame
      title="Menge und Wirkung"
      caption="Keine Menge, wenig, viel — aus den gemessenen Gramm."
      summary={rows
        .map(
          (row) =>
            `${LEVEL_LABELS[row.level]}: ${
              row.mean === null ? 'keine Daten' : formatGermanNumber(round(row.mean))
            } bei ${row.n} Beobachtungen`
        )
        .join('. ')}
      chart={
        <ul className="space-y-2" aria-hidden>
          {rows.map((row) => (
            <li key={row.level} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-xs text-muted">
                {LEVEL_LABELS[row.level]}
              </span>
              <span className="h-4 min-w-0 flex-1 rounded-pill bg-bg-sunken">
                <span
                  className={`block h-4 rounded-pill ${rampClassFor(
                    scaleToRamp(row.mean, max)
                  )}`}
                  style={{
                    width: `${Math.min(100, (Math.abs(row.mean ?? 0) / max) * 100)}%`,
                  }}
                />
              </span>
              <span className="num w-20 shrink-0 text-right text-xs text-fg">
                {row.mean === null ? '–' : formatGermanNumber(round(row.mean))}
              </span>
              <span className="num w-12 shrink-0 text-right text-xs text-muted">
                n={row.n}
              </span>
            </li>
          ))}
        </ul>
      }
      table={
        <DataTable
          caption="Menge und Wirkung"
          columns={[
            {
              key: 'level',
              label: 'Menge',
              render: (row) => LEVEL_LABELS[row.level],
            },
            {
              key: 'mean',
              label: 'Wert',
              align: 'right',
              render: (row) =>
                row.mean === null ? '–' : formatGermanNumber(round(row.mean)),
            },
            { key: 'n', label: 'Fälle', align: 'right', render: (row) => row.n },
          ]}
          rows={rows}
          rowKey={(row) => row.level}
        />
      }
      footer={DESCRIPTIVE_NOTICE}
    />
  );
}

function scaleToRamp(value: number | null, max: number): number {
  if (value === null) return 0;
  return Math.round((Math.abs(value) / max) * 10);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
