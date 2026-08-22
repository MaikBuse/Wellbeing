import { DIVERGE_NEGATIVE, DIVERGE_POSITIVE, MARK } from '@/lib/chart-theme';
import { formatGermanNumber } from '@/lib/nutrition';
import { cn } from '@/lib/utils';

/**
 * One factor's effect: a dot for the estimate, a line for the interval, on a
 * scale shared by every row in the same unit.
 *
 * Hand-built rather than a Recharts scatter with error bars, for two reasons.
 * On a phone, a list of rows with the label, the counts and the wording inline
 * reads far better than a plot with a category axis. And the shared domain has
 * to be computed across rows anyway, which a per-row chart cannot do.
 *
 * Direction is carried three ways over — colour, the sign, and the words — so
 * the colour is never doing the work alone.
 */
export function IntervalScale({
  point,
  low,
  high,
  domain,
  /** Whether a positive value means worse. Effects here always do. */
  higherIsWorse = true,
  label,
}: {
  point: number;
  low: number;
  high: number;
  domain: [number, number];
  higherIsWorse?: boolean;
  label: string;
}) {
  const [min, max] = domain;
  const span = max - min || 1;
  const toPercent = (value: number) =>
    Math.min(100, Math.max(0, ((value - min) / span) * 100));

  const zeroAt = toPercent(0);
  const lowAt = toPercent(low);
  const highAt = toPercent(high);
  const pointAt = toPercent(point);

  const worse = higherIsWorse ? point > 0 : point < 0;
  const color = worse ? DIVERGE_NEGATIVE : DIVERGE_POSITIVE;

  return (
    <div
      className="relative h-6 w-full"
      role="img"
      aria-label={`${label}: Schätzwert ${formatGermanNumber(round(point))}, Bereich ${formatGermanNumber(round(low))} bis ${formatGermanNumber(round(high))}`}
    >
      {/* The zero line: a hairline, so "no difference" has a visible anchor. */}
      <span
        aria-hidden
        className="absolute inset-y-1 w-px bg-line-strong"
        style={{ left: `${zeroAt}%` }}
      />
      {/* The interval. 2px, the line-mark weight. */}
      <span
        aria-hidden
        className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-pill"
        style={{
          left: `${Math.min(lowAt, highAt)}%`,
          width: `${Math.abs(highAt - lowAt)}%`,
          backgroundColor: color,
        }}
      />
      {/* The estimate. >= 8px across, with a surface ring so it stays legible
          where it crosses the zero line. */}
      <span
        aria-hidden
        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-pill"
        style={{
          left: `${pointAt}%`,
          width: MARK.dotRadius * 2,
          height: MARK.dotRadius * 2,
          backgroundColor: color,
          boxShadow: `0 0 0 ${MARK.dotRingWidth}px #ffffff`,
        }}
      />
    </div>
  );
}

/**
 * A shared domain across rows, padded and forced to contain zero.
 *
 * Zero has to be inside the scale or "the interval excludes zero" stops being
 * legible, which is the single most important thing to read off these rows.
 */
export function sharedDomain(
  values: { low: number; high: number }[]
): [number, number] {
  if (values.length === 0) return [-1, 1];
  let min = 0;
  let max = 0;
  for (const value of values) {
    min = Math.min(min, value.low);
    max = Math.max(max, value.high);
  }
  const pad = (max - min) * 0.08 || 1;
  return [min - pad, max + pad];
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Axis labels for a shared scale. Rendered once per group, not per row. */
export function IntervalAxis({
  domain,
  unitLabel,
}: {
  domain: [number, number];
  unitLabel: string;
}) {
  const [min, max] = domain;
  const zeroAt = ((0 - min) / (max - min || 1)) * 100;
  return (
    <div className="relative mb-1 h-4 text-eyebrow uppercase text-muted">
      <span className="absolute left-0">{formatGermanNumber(Math.round(min))}</span>
      <span
        className="absolute -translate-x-1/2"
        style={{ left: `${zeroAt}%` }}
      >
        0
      </span>
      <span className="absolute right-0">
        {formatGermanNumber(Math.round(max))} {unitLabel}
      </span>
    </div>
  );
}

/**
 * The verdict, as a chip. Never colour alone — the word is the label.
 *
 * Three tones, not four: `not_yet` was never a verdict but a statement about
 * how much data there is, and that axis now belongs to the reliability meter.
 */
export function FindingChip({
  label,
  tone,
}: {
  label: string;
  tone: 'clear' | 'possible' | 'no_signal';
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-pill px-2 py-0.5 text-xs font-medium',
        tone === 'clear' && 'bg-secondary/25 text-fg',
        tone === 'possible' && 'bg-soft text-primary-fg',
        tone === 'no_signal' && 'bg-bg-sunken text-muted'
      )}
    >
      {label}
    </span>
  );
}
