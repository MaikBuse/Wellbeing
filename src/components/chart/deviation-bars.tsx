'use client';

import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CHART_INK,
  CHART_MARGIN,
  CHART_SIZE,
  DIVERGE_NEGATIVE,
  DIVERGE_POSITIVE,
  MARK,
} from '@/lib/chart-theme';
import { useReducedMotion } from '@/lib/use-media-query';

/**
 * Deviation from her own trailing 7-day median, as diverging bars.
 *
 * The job is polarity, not magnitude, so the form is a diverging bar around a
 * zero baseline: cool for better than her own normal, warm for worse, and a
 * neutral hairline in between so "no change" reads as nothing rather than as a
 * third category.
 *
 * `barCategoryGap` is what leaves surface between neighbouring bars. Separation
 * is done with empty space, never with a stroke around the mark — a border is
 * data-weight ink that is not data.
 */
export type DeviationPoint = {
  label: string;
  value: number | null;
};

export function DeviationBars({
  points,
  height = CHART_SIZE.panelHeight + CHART_SIZE.axisBand,
}: {
  points: DeviationPoint[];
  height?: number;
}) {
  const reducedMotion = useReducedMotion();
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  const extent = Math.max(1, ...values.map(Math.abs));

  return (
    <div style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={points}
          margin={CHART_MARGIN}
          barCategoryGap={MARK.surfaceGap}
        >
          <CartesianGrid
            horizontal
            vertical={false}
            stroke={CHART_INK.grid}
            strokeWidth={MARK.gridWidth}
          />
          <YAxis
            width={28}
            domain={[-extent, extent]}
            tick={{ fill: CHART_INK.axisText, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickCount={3}
          />
          <XAxis
            dataKey="label"
            tick={{ fill: CHART_INK.axisText, fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: CHART_INK.baseline }}
            minTickGap={40}
          />
          <ReferenceLine y={0} stroke={CHART_INK.baseline} strokeWidth={MARK.gridWidth} />
          <Bar
            dataKey="value"
            maxBarSize={MARK.maxBarSize}
            radius={[MARK.barRadius, MARK.barRadius, 0, 0]}
            isAnimationActive={!reducedMotion}
          >
            {points.map((point) => (
              <Cell
                key={point.label}
                fill={
                  (point.value ?? 0) >= 0 ? DIVERGE_NEGATIVE : DIVERGE_POSITIVE
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
