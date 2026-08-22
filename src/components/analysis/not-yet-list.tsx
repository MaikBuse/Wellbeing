import { Card, CardHeader, CardMeta, CardTitle } from '@/components/ui/card';
import { Disclosure } from '@/components/ui/disclosure';
import { gateLabel, largestShortfall } from '@/services/analysis/gates';
import { formatShortfall } from '@/services/analysis/labels';
import type { AnalysisFinding } from '@/services/analysis/types';

/**
 * The factors that could not be evaluated yet.
 *
 * Shown, never hidden, and with the single largest shortfall spelled out. Two
 * reasons. It tells her exactly what to record more of, which is actionable in a
 * way a ranking is not. And an absent factor must not read as an innocent one —
 * "we did not look at this" and "this is fine" are different statements.
 */
export function NotYetList({ findings }: { findings: AnalysisFinding[] }) {
  const pending = findings.filter((f) => f.status === 'not_yet');
  if (pending.length === 0) return null;

  const rows = pending
    .map((finding) => ({ finding, gate: largestShortfall(finding.gates) }))
    .filter(
      (row): row is { finding: AnalysisFinding; gate: NonNullable<typeof row.gate> } =>
        row.gate !== null
    )
    .sort(
      (a, b) =>
        a.gate.need - a.gate.have - (b.gate.need - b.gate.have)
    );

  return (
    <Card variant="sunken">
      <CardHeader>
        <CardTitle>Noch nicht auswertbar</CardTitle>
        <CardMeta>
          {pending.length} Faktoren. Fehlende Daten heißen nicht
          &bdquo;unbedenklich&ldquo;.
        </CardMeta>
      </CardHeader>
      <Disclosure label={`${rows.length} Faktoren anzeigen`}>
        <ul className="space-y-1.5">
          {rows.map(({ finding, gate: shortfall }) => (
            <li key={finding.key} className="text-sm text-muted">
              {formatShortfall(
                finding.labelDe,
                shortfall.need,
                shortfall.have,
                gateLabel(shortfall.gate)
              )}
            </li>
          ))}
        </ul>
      </Disclosure>
    </Card>
  );
}
