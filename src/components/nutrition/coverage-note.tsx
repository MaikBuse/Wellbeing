import { cn } from '@/lib/utils';

/**
 * How much of the day carried measurements.
 *
 * Never in rose. Rose means "worse symptoms" everywhere else in this app, and
 * thin data is a thin measurement, not a bad outcome — the same sentence
 * `completeness-blocks.tsx` is built around. Four neutral segments and a plain
 * number; the absence of fill is the statement.
 */
export function CoverageNote({
  share,
  className,
}: {
  share: number;
  className?: string;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, share)) * 100);
  const filled = Math.round((percent / 100) * 4);

  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <p className="text-xs text-muted">
        {percent} % der erfassten Gramm haben Messwerte.
      </p>
      <span
        role="img"
        aria-label={`Messwertabdeckung ${percent} Prozent`}
        className="flex shrink-0 gap-0.5"
      >
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            aria-hidden
            className={cn(
              'block size-1.5 rounded-[2px]',
              index < filled ? 'bg-chart-1' : 'bg-bg-sunken'
            )}
          />
        ))}
      </span>
    </div>
  );
}
