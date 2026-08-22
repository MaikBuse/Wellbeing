import { notFound } from 'next/navigation';
import { requireUser } from '@/auth.helpers';
import { latestRun } from '@/db/queries/analysis';
import { BalanceTable } from '@/components/analysis/balance-table';
import { DoseResponse } from '@/components/analysis/dose-response';
import { FindingChip } from '@/components/chart/interval-row';
import { Card, CardHeader, CardMeta, CardTitle } from '@/components/ui/card';
import { Disclosure } from '@/components/ui/disclosure';
import { Button } from '@/components/ui/button';
import {
  ANALYSIS_KIND_SUSPICION,
  analysisParamsSchema,
  analysisResultsSchema,
} from '@/services/analysis/types';
import {
  DESCRIPTIVE_NOTICE,
  FINDING_LABELS,
  MEASUREMENT_BASIS_HINTS,
  MEASUREMENT_BASIS_LABELS,
  formatCollinearity,
  formatDayCounts,
  formatIndexPoints,
  formatInterval,
  formatMealCounts,
  formatQValue,
  formatRiskDifference,
  formatStability,
  formatGatesMet,
  NOT_COMPUTABLE_NOTICE,
  NO_INTERVAL_NOTICE,
} from '@/services/analysis/labels';
import { gateLabel } from '@/services/analysis/gates';
import { ReliabilityMeter } from '@/components/analysis/reliability-meter';
import { ONSET_LAG_LABELS, type OnsetLagKey } from '@/lib/scales';
import { formatGermanNumber } from '@/lib/nutrition';
import Link from 'next/link';

export default async function FactorDetailPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const user = await requireUser();
  const run = await latestRun(user.id, ANALYSIS_KIND_SUSPICION);
  if (!run) notFound();

  const parsed = analysisResultsSchema.safeParse(run.results);
  if (!parsed.success) notFound();

  const finding = parsed.data.find((f) => f.key === key);
  if (!finding) notFound();

  const runParams = analysisParamsSchema.safeParse(run.params);
  const effect = finding.effect;
  const unit = effect?.kind === 'risk_difference_pp' ? 'pp' : 'points';
  const stability = formatStability(finding.stability.weeksInTopFive);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          action={
            finding.label ? (
              <FindingChip
                label={FINDING_LABELS[finding.label]}
                tone={finding.label}
              />
            ) : null
          }
        >
          <CardTitle>{finding.labelDe}</CardTitle>
          <CardMeta>
            {finding.model === 'meal_reaction'
              ? `Reaktion pro Mahlzeit · Fenster ${
                  ONSET_LAG_LABELS[finding.window as OnsetLagKey] ?? finding.window
                }`
              : 'RA-Tageswert am Folgetag'}
          </CardMeta>
        </CardHeader>

        {effect ? (
          <>
            <p className="num text-metric font-semibold text-fg">
              {effect.kind === 'risk_difference_pp'
                ? formatRiskDifference(effect.point)
                : formatIndexPoints(effect.point)}
            </p>
            <p className="mt-1 text-sm text-muted">
              {formatInterval(effect.ciLow, effect.ciHigh, unit)}
            </p>
            <p className="num mt-2 text-sm text-fg">
              {effect.kind === 'risk_difference_pp'
                ? formatMealCounts(
                    finding.labelDe,
                    finding.exposed.notable ?? 0,
                    finding.exposed.n,
                    finding.unexposed.notable ?? 0,
                    finding.unexposed.n
                  )
                : formatDayCounts(finding.exposed.n, finding.unexposed.n)}
            </p>
          </>
        ) : (
          <div className="space-y-1">
            <p className="num text-sm text-fg">
              {finding.exposed.n > 0
                ? finding.model === 'meal_reaction'
                  ? formatMealCounts(
                      finding.labelDe,
                      finding.exposed.notable ?? 0,
                      finding.exposed.n,
                      finding.unexposed.notable ?? 0,
                      finding.unexposed.n
                    )
                  : formatDayCounts(finding.exposed.n, finding.unexposed.n)
                : NOT_COMPUTABLE_NOTICE}
            </p>
            {finding.status === 'provisional' ? (
              <p className="text-xs text-muted">{NO_INTERVAL_NOTICE}</p>
            ) : null}
          </div>
        )}

        <div className="mt-3">
          <ReliabilityMeter level={finding.reliability.level} />
          <p className="mt-1 text-xs text-muted">
            {formatGatesMet(
              finding.reliability.gatesMet,
              finding.reliability.gatesTotal
            )}
          </p>
        </div>

        <Disclosure label="Was noch fehlt">
          <ul className="space-y-0.5 text-sm">
            {finding.gates.map((g) => (
              <li
                key={g.gate}
                className={
                  g.gate === finding.reliability.bindingGate
                    ? 'font-medium text-fg'
                    : 'text-muted'
                }
              >
                {gateLabel(g.gate)}: {g.have} von {g.need}
                {g.scope === 'global' ? ' (gilt für alle Faktoren)' : ''}
              </li>
            ))}
          </ul>
        </Disclosure>

        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-pill bg-bg-sunken px-2 py-0.5 text-muted">
            {MEASUREMENT_BASIS_LABELS[finding.measurementBasis]}
          </span>
          {stability ? (
            <span className="rounded-pill bg-soft px-2 py-0.5 text-primary-fg">
              {stability}
            </span>
          ) : null}
          {finding.stability.previousRank !== null ? (
            <span className="rounded-pill bg-bg-sunken px-2 py-0.5 text-muted">
              Vorwoche Platz {finding.stability.previousRank}
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted">
          {MEASUREMENT_BASIS_HINTS[finding.measurementBasis]}
        </p>

        {finding.collinearWith.length > 0 ? (
          <p className="mt-2 text-sm text-primary-strong">
            {formatCollinearity(
              finding.collinearWith[0].labelDe,
              finding.collinearWith[0].jaccard
            )}
          </p>
        ) : null}

        {finding.qValue !== null ||
        finding.sensitivity?.flareKept ||
        finding.attributionBias ? (
          <Disclosure label="Wie sicher ist das">
            {finding.qValue !== null ? (
              <p className="text-sm text-muted">{formatQValue(finding.qValue)}</p>
            ) : null}
            {finding.sensitivity?.flareKept ? (
              <p className="mt-2 text-sm text-muted">
                Mit Schubtagen gerechnet ergäbe sich{' '}
                {finding.sensitivity.flareKept.kind === 'risk_difference_pp'
                  ? formatRiskDifference(finding.sensitivity.flareKept.point)
                  : formatIndexPoints(finding.sensitivity.flareKept.point)}
                . Weicht das stark ab, hängt die Aussage an dieser Entscheidung.
              </p>
            ) : null}
            {finding.attributionBias ? (
              <p className="mt-2 text-sm text-muted">
                Selbst zugeordnete Reaktionen:{' '}
                {Math.round(finding.attributionBias.explicitLinkRateExposed * 100)} %
                der Mahlzeiten mit, {' '}
                {Math.round(finding.attributionBias.explicitLinkRateUnexposed * 100)} %
                ohne. Ein großer Unterschied heißt, dass die Aufmerksamkeit selbst
                mitgemessen wird.
              </p>
            ) : null}
          </Disclosure>
        ) : null}
      </Card>

      {finding.secondary ? (
        <Card variant="sunken">
          <CardHeader>
            <CardTitle>Weitere Kennzahlen</CardTitle>
            <CardMeta>{DESCRIPTIVE_NOTICE}</CardMeta>
          </CardHeader>
          <ul className="space-y-1 text-sm text-muted">
            {finding.secondary.meanSeverityDiff !== null ? (
              <li>
                Mittlere Stärke:{' '}
                {formatGermanNumber(
                  Math.round(finding.secondary.meanSeverityDiff * 100) / 100
                )}{' '}
                Punkte Unterschied
              </li>
            ) : null}
            {finding.secondary.probabilityOfSuperiority !== null ? (
              <li>
                Wahrscheinlichkeit, dass eine Mahlzeit mit stärker ausfällt als
                eine ohne:{' '}
                {Math.round(finding.secondary.probabilityOfSuperiority * 100)} %
              </li>
            ) : null}
          </ul>
        </Card>
      ) : null}

      {runParams.success ? (
        <DoseResponse
          finding={finding}
          blsGramsShare={runParams.data.counts.blsGramsShare}
          portionEvidenceShare={runParams.data.counts.portionEvidenceShare}
        />
      ) : null}

      <BalanceTable finding={finding} />

      <Button asChild variant="outline">
        <Link href="/analyse/faktoren">Zurück zur Liste</Link>
      </Button>
    </div>
  );
}
