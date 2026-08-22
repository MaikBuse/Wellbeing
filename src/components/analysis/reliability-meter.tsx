import { RELIABILITY_LABELS } from '@/services/analysis/labels';
import { cn } from '@/lib/utils';

/**
 * Four segments, filled to the reliability level.
 *
 * A meter rather than a colour: the segments are countable, so the level
 * survives without the fill, and the word sits beside it anyway — colour never
 * carries a value on its own in this app.
 *
 * The filled hue is the neutral chart blue, deliberately NOT a step of the rose
 * severity ramp. Rose means "worse symptoms" everywhere else, and reliability is
 * not severity; reusing it would say that thin data is a bad outcome rather than
 * a thin measurement.
 */
export function ReliabilityMeter({
  level,
  detail,
  className,
}: {
  level: 1 | 2 | 3 | 4;
  /** e.g. "11 von 25 Tagen mit Laktose". Optional — the word alone is valid. */
  detail?: string | null;
  className?: string;
}) {
  const word = RELIABILITY_LABELS[level];

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className="inline-flex gap-0.5"
        role="img"
        aria-label={`Verlässlichkeit ${level} von 4: ${word}`}
      >
        {[1, 2, 3, 4].map((segment) => (
          <span
            key={segment}
            aria-hidden
            className={cn(
              'h-2 w-2.5 rounded-[2px]',
              segment <= level ? 'bg-chart-1' : 'bg-bg-sunken'
            )}
          />
        ))}
      </span>
      <span className="text-xs text-muted">
        {word}
        {detail ? ` — ${detail}` : ''}
      </span>
    </span>
  );
}
