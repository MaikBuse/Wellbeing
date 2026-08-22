import { requireUser } from '@/auth.helpers';
import { latestRun } from '@/db/queries/analysis';
import { loadDaySeries } from '@/services/analysis/loader';
import { Card, CardHeader, CardMeta, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/chart/data-table';
import { CalendarHeatmap, CalendarLegend } from '@/components/chart/calendar-heatmap';
import {
  ANALYSIS_KIND_SUSPICION,
  analysisParamsSchema,
  analysisResultsSchema,
} from '@/services/analysis/types';
import {
  CORRELATION_NOTICE,
  FINDING_LABELS,
  NOT_A_DIAGNOSIS,
  RA_INDEX_NOTICE,
  formatIndexPoints,
  formatInterval,
  formatProvisionalCount,
  formatRiskDifference,
} from '@/services/analysis/labels';
import { formatLogDateLong } from '@/lib/time';
import { formatGermanNumber } from '@/lib/nutrition';
import Link from 'next/link';

/**
 * The printable summary for a rheumatology appointment.
 *
 * A print stylesheet on a normal route rather than a PDF library: it costs no
 * dependency, it stays in the same components, and the browser's own print
 * dialogue already does page setup better than a hand-rolled PDF would.
 *
 * The charts here are static by design — no scrubbing, no animation. An
 * interactive crosshair is worth nothing on paper.
 */
export default async function ReportPage() {
  const user = await requireUser();
  const [run, series] = await Promise.all([
    latestRun(user.id, ANALYSIS_KIND_SUSPICION),
    loadDaySeries(user.id, { days: 90 }),
  ]);

  const results = run ? analysisResultsSchema.safeParse(run.results) : null;
  const params = run ? analysisParamsSchema.safeParse(run.params) : null;
  const findings = results?.success ? results.data : [];

  /*
   * Confirmatory only, and that is a deliberate exception to "show everything".
   *
   * This is the one page that leaves the house. A rheumatologist with seven
   * minutes should not have to sort forty rows of wide intervals to find the
   * three that carry something, and a provisional number on paper — without the
   * reliability meter beside it — reads as a finding. The count of the others is
   * named instead, so nothing is concealed.
   */
  const notable = findings
    .filter(
      (f) =>
        f.status === 'confirmatory' &&
        (f.label === 'clear' || f.label === 'possible')
    )
    .sort((a, b) => b.sortScore - a.sortScore)
    .slice(0, 8);

  const provisionalCount = findings.filter((f) => f.status === 'provisional').length;

  const days = series.facts.days;
  const flareDays = days.filter((d) => d.isFlare).length;
  const withIndex = days.filter((d) => d.raIndex !== null);
  const meanIndex =
    withIndex.length === 0
      ? null
      : withIndex.reduce((sum, d) => sum + (d.raIndex as number), 0) /
        withIndex.length;

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <Button asChild variant="outline" size="sm">
          <Link href="/analyse/export?format=csv">Tagesreihe als CSV</Link>
        </Button>
      </div>

      <Card variant="plain" className="print:border-0 print:shadow-none">
        <CardHeader>
          <CardTitle>Verlauf für den Arzttermin</CardTitle>
          <CardMeta>
            {series.range.from} bis {series.range.to} · eigene Beobachtungen
          </CardMeta>
        </CardHeader>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted">Erfasste Tage</dt>
            <dd className="num font-semibold text-fg">
              {series.facts.counts.trackedDays} von {series.facts.counts.rangeDays}
            </dd>
          </div>
          <div>
            <dt className="text-muted">RA-Tageswert im Mittel</dt>
            <dd className="num font-semibold text-fg">
              {meanIndex === null
                ? '–'
                : formatGermanNumber(Math.round(meanIndex * 10) / 10)}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Tage als Schub markiert</dt>
            <dd className="num font-semibold text-fg">{flareDays}</dd>
          </div>
          <div>
            <dt className="text-muted">Basistherapie-Adhärenz</dt>
            <dd className="num font-semibold text-fg">
              {adherenceLabel(days)}
            </dd>
          </div>
        </dl>

        <p className="mt-3 text-xs text-muted">{RA_INDEX_NOTICE}</p>
      </Card>

      <Card variant="plain" className="print:border-0 print:shadow-none">
        <CardHeader>
          <CardTitle>Tagesverlauf</CardTitle>
          <CardMeta>Gefärbt nach RA-Tageswert; gestrichelt = kein Eintrag.</CardMeta>
        </CardHeader>
        <CalendarHeatmap
          cells={days.map((day) => ({
            logDate: day.logDate,
            value: day.raIndex === null ? null : Math.round(day.raIndex),
            isFlare: day.isFlare,
          }))}
          showValues={false}
          valueLabel="RA-Tageswert"
        />
        <div className="mt-2">
          <CalendarLegend valueLabel="RA-Tageswert" />
        </div>
      </Card>

      <Card variant="plain" className="print:border-0 print:shadow-none">
        <CardHeader>
          <CardTitle>Auffällige Zusammenhänge</CardTitle>
          <CardMeta>
            {run && params?.success
              ? `Berechnet am ${formatLogDateLong(
                  run.computedAt.toISOString().slice(0, 10)
                )}, Zeitraum ${run.rangeFrom} bis ${run.rangeTo}`
              : 'Noch keine Auswertung berechnet.'}
          </CardMeta>
        </CardHeader>

        {provisionalCount > 0 ? (
          <p className="mb-3 text-sm text-muted">
            {formatProvisionalCount(provisionalCount)}. Sie stehen in der App,
            hier nicht — dafür fehlen noch Daten.
          </p>
        ) : null}

        {notable.length === 0 ? (
          <p className="text-sm text-muted">
            Im ausgewerteten Zeitraum hat sich kein Zusammenhang deutlich genug
            abgezeichnet. Das ist ein Ergebnis, kein fehlendes Ergebnis.
          </p>
        ) : (
          <DataTable
            caption="Auffällige Zusammenhänge"
            columns={[
              { key: 'label', label: 'Faktor', render: (row) => row.labelDe },
              {
                key: 'model',
                label: 'Modell',
                render: (row) =>
                  row.model === 'meal_reaction' ? 'pro Mahlzeit' : 'Folgetag',
              },
              {
                key: 'effect',
                label: 'Effekt',
                align: 'right',
                render: (row) =>
                  row.effect
                    ? row.effect.kind === 'risk_difference_pp'
                      ? formatRiskDifference(row.effect.point)
                      : formatIndexPoints(row.effect.point)
                    : '–',
              },
              {
                key: 'interval',
                label: 'Bereich',
                render: (row) =>
                  row.effect
                    ? formatInterval(
                        row.effect.ciLow,
                        row.effect.ciHigh,
                        row.effect.kind === 'risk_difference_pp' ? 'pp' : 'points'
                      )
                    : '–',
              },
              {
                key: 'verdict',
                label: 'Einordnung',
                render: (row) => (row.label ? FINDING_LABELS[row.label] : '–'),
              },
            ]}
            rows={notable}
            rowKey={(row) => row.key}
          />
        )}
      </Card>

      <Card variant="sunken" className="print:border print:shadow-none">
        <p className="text-sm text-fg">
          <strong className="font-semibold">{CORRELATION_NOTICE}</strong>{' '}
          {NOT_A_DIAGNOSIS}
        </p>
        <p className="mt-2 text-xs text-muted">
          Die Werte stammen aus Selbstauskunft. Es gibt keine Blutwerte in dieser
          Auswertung, also keinen DAS28 und keinen anderen geprüften Score.
          Nährwerte und Messwerte kommen aus dem Bundeslebensmittelschlüssel 4.0
          des Max Rubner-Instituts und aus Open Food Facts.
        </p>
      </Card>
    </div>
  );
}

function adherenceLabel(days: { dmardAdherence7d: number | null }[]): string {
  const values = days
    .map((d) => d.dmardAdherence7d)
    .filter((v): v is number => v !== null);
  if (values.length === 0) return '–';
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return `${Math.round(mean * 100)} %`;
}
