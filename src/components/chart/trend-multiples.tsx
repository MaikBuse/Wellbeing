'use client';

import { useCallback, useRef, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_INK, CHART_MARGIN, CHART_SIZE, MARK } from '@/lib/chart-theme';
import { useReducedMotion } from '@/lib/use-media-query';
import { formatGermanNumber } from '@/lib/nutrition';
import { cn } from '@/lib/utils';

/**
 * The day series, as small multiples with one shared crosshair.
 *
 * Why small multiples and not one chart: joint pain is 0-10 and morning
 * stiffness is minutes 0-1440. Putting both on one plot needs two y-scales, and
 * a dual-axis chart invents a correlation that is not in the data — the
 * alignment of the two scales is arbitrary. Each measure gets its own panel and
 * its own scale, and the crosshair is what ties them together.
 *
 * The readout is OURS, not Recharts' tooltip. The default tooltip is unreliable
 * under touch and its prop surface shifts between versions; more importantly the
 * house rule says the SVG is decoration and the value is real text. So Recharts
 * draws marks and axes, and the numbers live in a real, `aria-live` panel above
 * the panels — which also makes them reachable without hovering at all.
 */

/** Fixed so the scrub layer can compute the plot geometry without measuring. */
const Y_AXIS_WIDTH = 28;

/**
 * Every field here has to be SERIALISABLE.
 *
 * A formatter function used to live on this type, and it cost an afternoon: a
 * server component cannot hand a function across the RSC boundary, and React
 * fails with an opaque `chunk.reason.enqueueModel is not a function` rather than
 * naming the prop. So the metric declares how many decimals it wants and the
 * formatting happens on this side of the boundary.
 */
export type TrendMetric = {
  key: string;
  label: string;
  unit?: string;
  domain: [number, number];
  /** Decimal places in the readout. */
  decimals?: 0 | 1;
  /** Emphasis: the lead metric gets a taller panel. */
  lead?: boolean;
};

export type TrendPoint = {
  logDate: string;
  label: string;
  values: Record<string, number | null>;
  isFlare: boolean;
};

export function TrendMultiples({
  points,
  metrics,
}: {
  points: TrendPoint[];
  metrics: TrendMetric[];
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const reducedMotion = useReducedMotion();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const indexFromClientX = useCallback(
    (clientX: number, element: HTMLElement): number | null => {
      if (points.length < 2) return points.length === 1 ? 0 : null;
      const rect = element.getBoundingClientRect();
      const plotLeft = CHART_MARGIN.left + Y_AXIS_WIDTH;
      const plotWidth = rect.width - plotLeft - CHART_MARGIN.right;
      if (plotWidth <= 0) return null;
      const ratio = (clientX - rect.left - plotLeft) / plotWidth;
      const index = Math.round(ratio * (points.length - 1));
      return Math.min(points.length - 1, Math.max(0, index));
    },
    [points.length]
  );

  const handlePointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const index = indexFromClientX(event.clientX, event.currentTarget);
      if (index === null) return;
      setActiveIndex(index);
      // Where it exists, a short tick on crossing into a new day makes scrubbing
      // feel like it has detents. iOS Safari has no vibrate(); it degrades to
      // nothing, silently, which is the correct outcome.
      if (index !== activeIndex && typeof navigator.vibrate === 'function') {
        navigator.vibrate(8);
      }
    },
    [activeIndex, indexFromClientX]
  );

  const handleKey = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (points.length === 0) return;
      const current = activeIndex ?? points.length - 1;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setActiveIndex(Math.max(0, current - 1));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setActiveIndex(Math.min(points.length - 1, current + 1));
      } else if (event.key === 'Home') {
        event.preventDefault();
        setActiveIndex(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        setActiveIndex(points.length - 1);
      }
    },
    [activeIndex, points]
  );

  const active = activeIndex === null ? null : points[activeIndex];
  const flareBands = flareRanges(points);

  // Flattened for Recharts: a nested `values.x` dataKey would rely on its path
  // resolution, which is not worth depending on when one map call removes the
  // question entirely.
  const chartData = points.map((point) => ({ label: point.label, ...point.values }));

  return (
    <div>
      {/* The readout. Real text, always in the DOM, announced on change. */}
      <div
        aria-live="polite"
        className="mb-2 min-h-14 rounded-control bg-bg-sunken px-3 py-2"
      >
        {active ? (
          <>
            <p className="text-eyebrow font-semibold uppercase tracking-wide text-muted">
              {active.label}
              {active.isFlare ? ' · Schub' : ''}
            </p>
            <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
              {metrics.map((metric) => {
                const value = active.values[metric.key];
                return (
                  <div key={metric.key} className="flex items-baseline gap-1">
                    <dt className="text-xs text-muted">{metric.label}</dt>
                    <dd className="num text-sm font-semibold text-fg">
                      {value === null ? '–' : formatValue(value, metric.decimals)}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </>
        ) : (
          <p className="pt-1 text-sm text-muted">
            Über die Kurve streichen, um einen Tag zu lesen.
          </p>
        )}
      </div>

      <div
        ref={wrapperRef}
        role="slider"
        tabIndex={0}
        aria-label="Tag im Verlauf wählen"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, points.length - 1)}
        aria-valuenow={activeIndex ?? 0}
        aria-valuetext={active ? active.label : 'kein Tag gewählt'}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          handlePointer(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            handlePointer(event);
          }
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onKeyDown={handleKey}
        // Vertical page scrolling must keep working while a horizontal drag
        // scrubs. Without this the chart eats the scroll on a phone.
        className="touch-pan-y rounded-control outline-offset-2"
      >
        {metrics.map((metric, index) => {
          const isLast = index === metrics.length - 1;
          const height =
            (metric.lead ? CHART_SIZE.panelHeight + 40 : CHART_SIZE.panelHeight) +
            (isLast ? CHART_SIZE.axisBand : 0);

          return (
            <div key={metric.key} className={cn(index > 0 && 'mt-1')}>
              <p className="pl-1 text-xs text-muted">
                {metric.label}
                {metric.unit ? ` (${metric.unit})` : ''}
              </p>
              {/* The container height INCLUDES the axis band on the last panel,
                  or the card would grow its own nested scrollbar. */}
              <div style={{ height }} aria-hidden>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={CHART_MARGIN}>
                    {/* Horizontal only, hairline, SOLID — a dashed grid reads as
                        a threshold when it is just a grid. */}
                    <CartesianGrid
                      horizontal
                      vertical={false}
                      stroke={CHART_INK.grid}
                      strokeWidth={MARK.gridWidth}
                    />
                    {flareBands.map((band) => (
                      <ReferenceArea
                        key={`${metric.key}-${band.from}`}
                        x1={points[band.from].label}
                        x2={points[band.to].label}
                        fill={CHART_INK.neutral}
                        fillOpacity={1}
                        ifOverflow="extendDomain"
                      />
                    ))}
                    <YAxis
                      width={Y_AXIS_WIDTH}
                      domain={metric.domain}
                      tick={{ fill: CHART_INK.axisText, fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      tickCount={3}
                    />
                    <XAxis
                      dataKey="label"
                      hide={!isLast}
                      tick={{ fill: CHART_INK.axisText, fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: CHART_INK.baseline }}
                      minTickGap={40}
                    />
                    {active ? (
                      <ReferenceLine
                        x={active.label}
                        stroke={CHART_INK.baseline}
                        strokeWidth={MARK.gridWidth}
                      />
                    ) : null}
                    <Line
                      type="monotone"
                      dataKey={metric.key}
                      stroke={CHART_INK.valueText}
                      strokeWidth={MARK.lineWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      dot={false}
                      // A gap is a gap: connecting across an unlogged day would
                      // draw data that does not exist.
                      connectNulls={false}
                      isAnimationActive={!reducedMotion}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatValue(value: number, decimals: 0 | 1 = 0): string {
  const factor = decimals === 1 ? 10 : 1;
  return formatGermanNumber(Math.round(value * factor) / factor);
}

/** Contiguous runs of flare days, for the background bands. */
function flareRanges(points: TrendPoint[]): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let start: number | null = null;
  points.forEach((point, index) => {
    if (point.isFlare && start === null) start = index;
    if (!point.isFlare && start !== null) {
      out.push({ from: start, to: index - 1 });
      start = null;
    }
  });
  if (start !== null) out.push({ from: start, to: points.length - 1 });
  return out;
}
