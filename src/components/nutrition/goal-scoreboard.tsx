import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Sparkline } from '@/components/chart/sparkline';
import type { PeriodResult } from '@/services/nutrition/period';

/**
 * Every targeted nutrient, worst first.
 *
 * Sorted by how rarely the target was reached, so "what is chronically short"
 * is the top of the list rather than something to hunt for. The denominator is
 * printed in words on every row — "an 6 von 24 auswertbaren Tagen" — because
 * the percentage alone would hide how thin the evidence is.
 */
export function GoalScoreboard({ rows }: { rows: readonly PeriodResult[] }) {
  return (
    <ul className="divide-y divide-line-soft">
      {rows.map((row) => (
        <li key={row.key}>
          <Link
            href={`/nutrition/${row.key}`}
            className="flex min-h-11 items-center gap-3 py-2.5"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-fg">
                {row.labelDe}
              </span>
              <span className="block text-xs text-muted">
                {row.daysEvaluable === 0
                  ? 'noch keine auswertbaren Tage'
                  : `an ${row.daysInTarget} von ${row.daysEvaluable} auswertbaren Tagen im Ziel`}
              </span>
            </span>
            <span className="num w-12 shrink-0 text-right text-sm tabular-nums text-fg">
              {row.shareInTarget === null
                ? '–'
                : `${Math.round(row.shareInTarget * 100)} %`}
            </span>
            <span className="shrink-0">
              <Sparkline values={row.series} width={72} />
            </span>
            <ArrowRight aria-hidden className="size-4 shrink-0 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
