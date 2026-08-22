import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import {
  FindingChip,
  IntervalScale,
} from '@/components/chart/interval-row';
import {
  FINDING_LABELS,
  MEASUREMENT_BASIS_LABELS,
  formatCollinearity,
  formatDayCounts,
  formatIndexPoints,
  formatMealCounts,
  formatRiskDifference,
  formatStability,
  formatInterval,
} from '@/services/analysis/labels';
import type { AnalysisFinding } from '@/services/analysis/types';

/**
 * One row of the ranking.
 *
 * Everything a claim needs in order to be checkable is on the row: the effect in
 * her own units, the interval, the raw counts, and — where it applies — the
 * sentence saying this factor cannot be told apart from another one.
 *
 * The measurement badge matters more than it looks. Since the BLS landed, seven
 * of the analysed tags are decided by a MEASURED gram value while the rest are
 * still inferred from a name, and that difference says more about how much to
 * trust a row than any interval does.
 */
export function FactorRow({
  finding,
  domain,
}: {
  finding: AnalysisFinding;
  domain: [number, number];
}) {
  const effect = finding.effect;
  const unit = effect?.kind === 'risk_difference_pp' ? 'pp' : 'points';
  const stability = formatStability(finding.stability.weeksInTopFive);
  const collinear = finding.collinearWith[0];

  return (
    <li>
      <Link
        href={`/analyse/faktoren/${finding.key}`}
        className="block rounded-control px-1 py-2.5 transition-colors duration-120 ease-out-soft hover:bg-primary-tint active:scale-[0.99]"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{finding.labelDe}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <span className="rounded-pill bg-bg-sunken px-1.5 py-0.5">
                {MEASUREMENT_BASIS_LABELS[finding.measurementBasis]}
              </span>
              {stability ? (
                <span className="rounded-pill bg-soft px-1.5 py-0.5 text-primary-fg">
                  {stability}
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <FindingChip
              label={FINDING_LABELS[finding.label]}
              tone={finding.label}
            />
            <ChevronRight aria-hidden className="size-4 text-muted" />
          </div>
        </div>

        {effect ? (
          <>
            <p className="num mt-1.5 text-sm font-semibold text-fg">
              {effect.kind === 'risk_difference_pp'
                ? formatRiskDifference(effect.point)
                : formatIndexPoints(effect.point)}
            </p>
            <IntervalScale
              point={effect.point}
              low={effect.ciLow}
              high={effect.ciHigh}
              domain={domain}
              label={finding.labelDe}
            />
            <p className="text-xs text-muted">
              {formatInterval(effect.ciLow, effect.ciHigh, unit)}
            </p>
            <p className="num mt-0.5 text-xs text-muted">
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
        ) : null}

        {collinear ? (
          <p className="mt-1 text-xs text-primary-strong">
            {formatCollinearity(collinear.labelDe, collinear.jaccard)}
          </p>
        ) : null}
      </Link>
    </li>
  );
}
