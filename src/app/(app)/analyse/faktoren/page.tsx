import { Suspense } from 'react';
import { requireUser } from '@/auth.helpers';
import { latestRun } from '@/db/queries/analysis';
import { FactorList } from '@/components/analysis/factor-list';
import { NotYetList } from '@/components/analysis/not-yet-list';
import { RecomputeButton } from '@/components/analysis/recompute-button';
import { Card, CardHeader, CardMeta, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Disclosure } from '@/components/ui/disclosure';
import {
  ANALYSIS_KIND_SUSPICION,
  analysisResultsSchema,
  analysisParamsSchema,
} from '@/services/analysis/types';
import { OVERFITTING_NOTICE } from '@/services/analysis/labels';
import { formatLogDateLong } from '@/lib/time';
import { formatGermanNumber } from '@/lib/nutrition';

export default function FactorsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <FactorsContent />
    </Suspense>
  );
}

async function FactorsContent() {
  const user = await requireUser();
  const run = await latestRun(user.id, ANALYSIS_KIND_SUSPICION);

  if (!run) {
    return (
      <Card>
        <CardHeader action={<RecomputeButton hasRun={false} />}>
          <CardTitle>Verdachts-Ranking</CardTitle>
          <CardMeta>Noch nicht berechnet.</CardMeta>
        </CardHeader>
        <EmptyState
          title="Noch keine Auswertung"
          description="Die Berechnung läuft auf Knopfdruck und dauert ein paar Sekunden."
        />
      </Card>
    );
  }

  // Parsed defensively: a run written by an older version must not crash the
  // page. An unreadable one is treated as absent and offers a recompute.
  const results = analysisResultsSchema.safeParse(run.results);
  const params = analysisParamsSchema.safeParse(run.params);

  if (!results.success) {
    return (
      <Card>
        <CardHeader action={<RecomputeButton hasRun />}>
          <CardTitle>Verdachts-Ranking</CardTitle>
          <CardMeta>
            Die gespeicherte Auswertung stammt aus einer älteren Version.
          </CardMeta>
        </CardHeader>
        <EmptyState
          title="Neu berechnen"
          description="Das Format hat sich geändert. Ein neuer Durchlauf stellt die Anzeige wieder her."
        />
      </Card>
    );
  }

  const findings = results.data;
  const mealFindings = findings.filter(
    (f) => f.effect?.kind === 'risk_difference_pp'
  );
  const dayFindings = findings.filter(
    (f) => f.effect?.kind === 'mean_index_points'
  );

  return (
    <div className="space-y-4">
      <Card variant="plain">
        <CardHeader action={<RecomputeButton hasRun />}>
          <CardTitle>Verdachts-Ranking</CardTitle>
          <CardMeta>
            Berechnet am {formatLogDateLong(run.computedAt.toISOString().slice(0, 10))}
            {' · '}
            {run.rangeFrom} bis {run.rangeTo}
          </CardMeta>
        </CardHeader>
        <p className="text-sm text-muted">{OVERFITTING_NOTICE}</p>
        {params.success ? (
          <Disclosure label="Wie gerechnet wurde">
            <ul className="space-y-1 text-xs text-muted">
              <li>
                Ausgewertete Tage: {params.data.counts.trackedDays} von{' '}
                {params.data.counts.rangeDays}
              </li>
              <li>Tage mit RA-Tageswert: {params.data.counts.daysWithRaIndex}</li>
              <li>
                Blocklänge im Bootstrap:{' '}
                {params.data.bootstrap.expectedBlockLength} Tage
                {params.data.bootstrap.acfLagUsed !== null
                  ? ` (aus der Autokorrelation bei Verzögerung ${params.data.bootstrap.acfLagUsed})`
                  : ' (Obergrenze, weil die Autokorrelation nicht abfiel)'}
              </li>
              <li>
                Anteil messbarer Gramm:{' '}
                {Math.round(params.data.counts.blsGramsShare * 100)} %, davon mit
                Mengenangabe {Math.round(params.data.counts.portionEvidenceShare * 100)} %
              </li>
              <li>
                Ausgeschlossen: {params.data.exclusions.protocolDays} Protokolltage,{' '}
                {params.data.exclusions.flareDaysExcluded} Schubtage als Folgetag,{' '}
                {params.data.exclusions.untrackedDaysExcluded} unerfasste Tage
              </li>
              <li>
                Spuren zählen als Exposition:{' '}
                {params.data.countTraceExposure ? 'ja' : 'nein'}
              </li>
              <li>
                Falsch-Entdeckungs-Rate gedeckelt bei{' '}
                {formatGermanNumber(params.data.fdr.alpha)}
              </li>
            </ul>
          </Disclosure>
        ) : null}
      </Card>

      <FactorList
        title="Reaktion nach der Mahlzeit"
        caption="Wie oft eine merkliche Reaktion im vorab festgelegten Zeitfenster folgte."
        findings={mealFindings}
        unitLabel="Prozentpunkte"
        emptyHint="Es braucht mehr Mahlzeiten mit und ohne das jeweilige Merkmal."
      />

      <FactorList
        title="RA-Tageswert am Folgetag"
        caption="Ernährungsmuster und Störfaktoren gegen den Wert am nächsten Tag."
        findings={dayFindings}
        unitLabel="Punkte"
        emptyHint="Es braucht mehr Tage mit Tagescheck."
      />

      <NotYetList findings={findings} />
    </div>
  );
}
