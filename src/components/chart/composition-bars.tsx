import { CHART_INK, CHART_SERIES, MARK } from '@/lib/chart-theme';
import { cn } from '@/lib/utils';

/**
 * A horizontal part-to-whole bar.
 *
 * Plain HTML rather than Recharts: a single stacked bar needs no scales, no
 * axes, and no runtime — the same reasoning that made `macro-bar.tsx` a row of
 * divs. It also keeps this a server component.
 *
 * Segments are separated by a 2px gap in the surface colour, never by a border
 * around each one: a stroke adds data-weight ink that is not data. Six slots
 * maximum; past that the caller folds the tail into "Sonstiges".
 */
export function CompositionBar({
  segments,
  total,
}: {
  segments: { label: string; value: number }[];
  total: number;
}) {
  if (total <= 0) return null;

  return (
    <div aria-hidden className="flex h-4 w-full gap-0.5 overflow-hidden rounded-pill">
      {segments.map((segment, index) => (
        <span
          key={segment.label}
          className={cn('h-full first:rounded-l-pill last:rounded-r-pill')}
          style={{
            width: `${(segment.value / total) * 100}%`,
            backgroundColor:
              segment.label === 'Sonstiges'
                ? CHART_INK.baseline
                : CHART_SERIES[index % CHART_SERIES.length],
            minWidth: segment.value > 0 ? MARK.surfaceGap : 0,
          }}
        />
      ))}
    </div>
  );
}

/**
 * The legend, with the share printed beside each label.
 *
 * A `<dl>` so the pairing survives without the colour, and the number is always
 * present — colour never carries a value on its own.
 */
export function CompositionLegend({
  segments,
  total,
  unit,
}: {
  segments: { label: string; value: number }[];
  total: number;
  unit: string;
}) {
  return (
    <dl className="mt-2 space-y-1">
      {segments.map((segment, index) => (
        <div key={segment.label} className="flex items-center gap-2 text-sm">
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-[3px]"
            style={{
              backgroundColor:
                segment.label === 'Sonstiges'
                  ? CHART_INK.baseline
                  : CHART_SERIES[index % CHART_SERIES.length],
            }}
          />
          <dt className="min-w-0 flex-1 truncate text-fg">{segment.label}</dt>
          <dd className="num shrink-0 text-muted">
            {Math.round((segment.value / total) * 100)} %{' '}
            <span className="text-xs">
              ({Math.round(segment.value)} {unit})
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
