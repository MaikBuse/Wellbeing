import { Card, CardHeader, CardMeta, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { IntervalAxis, sharedDomain } from '@/components/chart/interval-row';
import { FactorRow } from './factor-row';
import { FDR_SCOPE_NOTICE } from '@/services/analysis/labels';
import type { AnalysisFinding } from '@/services/analysis/types';

/**
 * The ranking, grouped by UNIT rather than merged into one list.
 *
 * Model A is in percentage points of "a notable reaction after a meal"; Model B
 * is in RA-index points on the following day. Ordering those against each other
 * would be comparing two different things, and an interval scale only means
 * something when every row on it shares a unit. So there are two groups, each
 * with its own shared scale.
 *
 * Confounders sit in the second group beside the food patterns, with a badge —
 * for someone with RA, sleep and stress are usually the more actionable lever,
 * and burying them in a separate tab would say the opposite.
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
  const tested = findings.filter((f) => f.status === 'tested' && f.effect);

  if (tested.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardMeta>{caption}</CardMeta>
        </CardHeader>
        <EmptyState title="Noch nichts auswertbar" description={emptyHint} />
      </Card>
    );
  }

  const domain = sharedDomain(
    tested.map((f) => ({ low: f.effect!.ciLow, high: f.effect!.ciHigh }))
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardMeta>{caption}</CardMeta>
      </CardHeader>
      <IntervalAxis domain={domain} unitLabel={unitLabel} />
      <ul className="divide-y divide-line-soft">
        {tested
          .slice()
          .sort((a, b) => b.sortScore - a.sortScore)
          .map((finding) => (
            <FactorRow key={finding.key} finding={finding} domain={domain} />
          ))}
      </ul>
      <p className="mt-3 text-xs text-muted">{FDR_SCOPE_NOTICE}</p>
    </Card>
  );
}
