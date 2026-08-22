import { CHART_INK, CHART_SIZE, MARK } from '@/lib/chart-theme';

/**
 * A twelve-point sparkline for a stat tile.
 *
 * Hand-written SVG: Recharts for a 32 px trace would ship its whole runtime for
 * a polyline, and this can stay a server component that way. Follows the house
 * rule — the SVG is `aria-hidden`, the value beside it is real text.
 */
export function Sparkline({
  values,
  width = 96,
  height = CHART_SIZE.sparklineHeight,
}: {
  values: (number | null)[];
  width?: number;
  height?: number;
}) {
  const present = values.filter((v): v is number => v !== null);
  if (present.length < 2) return null;

  const min = Math.min(...present);
  const max = Math.max(...present);
  const span = max - min || 1;
  const step = width / Math.max(1, values.length - 1);
  const pad = MARK.lineWidth;

  const points: string[] = [];
  values.forEach((value, index) => {
    if (value === null) return;
    const x = index * step;
    const y = pad + (1 - (value - min) / span) * (height - 2 * pad);
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });

  const lastIndex = values.reduce<number>(
    (last, value, index) => (value === null ? last : index),
    -1
  );
  const lastValue = lastIndex >= 0 ? values[lastIndex] : null;

  return (
    <svg
      aria-hidden
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={CHART_INK.axisText}
        strokeWidth={MARK.lineWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {lastValue !== null ? (
        <circle
          cx={lastIndex * step}
          cy={pad + (1 - (lastValue - min) / span) * (height - 2 * pad)}
          r={MARK.dotRadius}
          fill={CHART_INK.valueText}
          stroke={CHART_INK.surface}
          strokeWidth={MARK.dotRingWidth}
        />
      ) : null}
    </svg>
  );
}
