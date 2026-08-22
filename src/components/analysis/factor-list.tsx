import { Card, CardHeader, CardMeta, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionLabel } from '@/components/ui/section-label';
import { IntervalAxis, sharedDomain } from '@/components/chart/interval-row';
import { FactorRow } from './factor-row';
import {
  FDR_SCOPE_NOTICE,
  PROVISIONAL_NOTICE,
  PROVISIONAL_ORDER_NOTICE,
  STATUS_SECTION_LABELS,
} from '@/services/analysis/labels';
import type { AnalysisFinding } from '@/services/analysis/types';

/**
 * The ranking, in two tiers within one unit.
 *
 * Confirmatory first, provisional below a hairline. The order itself carries
 * information: what is above the line has been counter-checked, what is below
 * has not. Both share one interval scale, because an interval only means
 * something when every row on it is in the same unit.
 *
 * The provisional tier is sorted by RELIABILITY, not by effect size, and that is
 * a deliberate refusal. With three exposed meals the risk difference sits on a
 * lattice about 33 percentage points apart, so whole intervals can land on one
 * side of zero purely as an artefact — `shrunkEffect` would then read that as
 * "excludes zero" and `sortScore` would lift three meals above a properly
 * determined finding. Sorted by reliability, the list answers a question that is
 * actually answerable: what is closest to being worth something.
 */
export function FactorList({
  title,
  caption,
  findings,
  unitLabel,
  emptyHint,
}: {
  title: string;
  caption: string;
  findings: AnalysisFinding[];
  unitLabel: string;
  emptyHint: string;
}) {
  const confirmatory = findings
    .filter((f) => f.status === 'confirmatory' && f.effect)
    .sort((a, b) => b.sortScore - a.sortScore);

  /*
   * Provisional rows are sorted by EVIDENCE COUNTS, never by the estimate.
   *
   * Every effect-based key is confounded with 1/n at low n: `sortScore` is
   * monotone in it (a one-meal artefact scores 137.8 against 0.49 for a strong
   * confirmatory finding), and so is |point| (89 pp expected at one meal, 5 pp
   * at thirty-six). Any of them would put the least-supported row first, every
   * time.
   *
   * So: how close to answerable, then how many observations are missing, then
   * the name for determinism. That is the only claim a provisional row can
   * honestly make — "we will know more about this one soonest".
   */
  const provisional = findings
    .filter((f) => f.status === 'provisional')
    .sort(
      (a, b) =>
        b.reliability.sufficiency - a.reliability.sufficiency ||
        shortfall(a) - shortfall(b) ||
        a.labelDe.localeCompare(b.labelDe, 'de')
    );

  if (confirmatory.length === 0 && provisional.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardMeta>{caption}</CardMeta>
        </CardHeader>
        <EmptyState title="Noch kein Vergleich möglich" description={emptyHint} />
      </Card>
    );
  }

  /*
   * Each tier gets its OWN axis.
   *
   * A single shared domain sounds tidier but one provisional row at [+88, +90]
   * stretches the axis to about [-7, +97], compressing every real finding into
   * the left quarter — and "the interval excludes zero", which is the single most
   * important thing to read off these rows, becomes unreadable. Sharing the axis
   * would destroy it.
   */
  const confirmatoryDomain = sharedDomain(
    confirmatory.map((f) => ({ low: f.effect!.ciLow, high: f.effect!.ciHigh }))
  );
  const provisionalDomain = sharedDomain(
    provisional
      .filter((f) => f.effect)
      .map((f) => ({ low: f.effect!.ciLow, high: f.effect!.ciHigh }))
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardMeta>{caption}</CardMeta>
      </CardHeader>
      {confirmatory.length > 0 ? (
        <>
          <SectionLabel>{STATUS_SECTION_LABELS.confirmatory}</SectionLabel>
          <IntervalAxis domain={confirmatoryDomain} unitLabel={unitLabel} />
          <ul className="divide-y divide-line-soft">
            {confirmatory.map((finding) => (
              <FactorRow
                key={finding.key}
                finding={finding}
                domain={confirmatoryDomain}
              />
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">{FDR_SCOPE_NOTICE}</p>
        </>
      ) : null}

      {provisional.length > 0 ? (
        <>
          <div className="my-3 border-t border-line" />
          <SectionLabel>{STATUS_SECTION_LABELS.provisional}</SectionLabel>
          <p className="mb-1 text-xs text-muted">{PROVISIONAL_NOTICE}</p>
          {provisional.some((f) => f.effect) ? (
            <IntervalAxis domain={provisionalDomain} unitLabel={unitLabel} />
          ) : null}
          <ul className="divide-y divide-line-soft">
            {provisional.map((finding) => (
              <FactorRow
                key={finding.key}
                finding={finding}
                domain={provisionalDomain}
              />
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">{PROVISIONAL_ORDER_NOTICE}</p>
        </>
      ) : null}
    </Card>
  );
}

/** Observations still missing on the gate that caps the score. */
function shortfall(finding: AnalysisFinding): number {
  const binding = finding.reliability.bindingGate;
  if (!binding) return 0;
  const g = finding.gates.find((x) => x.gate === binding);
  return g ? Math.max(0, g.need - g.have) : 0;
}
