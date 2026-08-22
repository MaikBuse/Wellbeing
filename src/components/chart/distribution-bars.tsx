'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_INK, CHART_MARGIN, CHART_SIZE, CHART_SERIES, MARK } from '@/lib/chart-theme';
import { useReducedMotion } from '@/lib/use-media-query';

/**
 * Grouped bars over the severity values.
 *
 * This is where the six-value scale becomes an advantage rather than a
 * limitation: `ScoreChips` can only produce {0, 2, 4, 6, 8, 10}, so the natural
 * distribution is six bars and there is no binning decision to make — and no
 * binning decision means no free parameter for a result to depend on.
 *
 * Two series, so a legend is mandatory. The 2px surface gap between the pair
 * comes from `barGap`.
 */
export type DistributionRow = {
  label: string;
  exposed: number;
  unexposed: number;
};

export function DistributionBars({
  rows,
  exposedLabel,
  unexposedLabel,
  height = CHART_SIZE.panelHeight + CHART_SIZE.axisBand,
}: {
  rows: DistributionRow[];
  exposedLabel: string;
  unexposedLabel: string;
  height?: number;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <div style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          margin={CHART_MARGIN}
          barGap={MARK.surfaceGap}
          barCategoryGap="20%"
        >
          <CartesianGrid
            horizontal
            vertical={false}
            stroke={CHART_INK.grid}
            strokeWidth={MARK.gridWidth}
          />
          <YAxis
            width={28}
            tick={{ fill: CHART_INK.axisText, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickCount={3}
            unit="%"
          />
          <XAxis
            dataKey="label"
            tick={{ fill: CHART_INK.axisText, fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: CHART_INK.baseline }}
          />
          <Bar
            name={exposedLabel}
            dataKey="exposed"
            fill={CHART_SERIES[1]}
            maxBarSize={MARK.maxBarSize}
            radius={[MARK.barRadius, MARK.barRadius, 0, 0]}
            isAnimationActive={!reducedMotion}
          />
          <Bar
            name={unexposedLabel}
            dataKey="unexposed"
            fill={CHART_SERIES[0]}
            maxBarSize={MARK.maxBarSize}
            radius={[MARK.barRadius, MARK.barRadius, 0, 0]}
            isAnimationActive={!reducedMotion}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
