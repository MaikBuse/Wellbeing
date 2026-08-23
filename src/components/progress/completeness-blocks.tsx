import { cn } from '@/lib/utils';
import type { CompletenessBlock } from '@/services/progress/types';

/**
 * The four building blocks of the completeness score, as labelled bars.
 *
 * Modelled on `ReliabilityMeter`: the fill is the neutral chart blue, never a
 * step of the rose severity ramp. Rose means "worse symptoms" everywhere else
 * in this app, and thin data is a thin measurement, not a bad outcome — saying
 * it in rose would tell someone their record-keeping made them ill.
 *
 * A block that does not apply prints "nicht fällig" rather than 0 %. That
 * distinction is the same one `adherenceForWindow` makes by returning null: a
 * fortnightly biologic has genuinely empty days, and scoring those as zero
 * would invent a failure out of the dosing interval.
 */
export function CompletenessBlocks({
  blocks,
  className,
}: {
  blocks: CompletenessBlock[];
  className?: string;
}) {
  return (
    <dl className={cn('space-y-2.5', className)}>
      {blocks.map((block) => {
        const percent = Math.round(Math.min(1, Math.max(0, block.share)) * 100);
        return (
          <div
            key={block.key}
            className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1"
          >
            <dt className="text-sm text-fg">{block.label}</dt>
            <dd className="num text-sm tabular-nums text-muted">
              {block.applicable ? `${percent} %` : 'nicht fällig'}
            </dd>
            <dd
              className="col-span-2 h-1.5 overflow-hidden rounded-pill bg-bg-sunken"
              role="img"
              aria-label={
                block.applicable
                  ? `${block.label}: ${percent} Prozent`
                  : `${block.label}: heute nicht fällig`
              }
            >
              <span
                aria-hidden
                className={cn(
                  'block h-full rounded-pill transition-[width] duration-450 ease-out-soft',
                  block.applicable ? 'bg-chart-1' : 'bg-line'
                )}
                style={{ width: block.applicable ? `${percent}%` : '100%' }}
              />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** The still-missing items, as short German phrases. Empty when the day is full. */
export function missingLabels(blocks: CompletenessBlock[]): string[] {
  return blocks
    .filter((block) => block.applicable && block.missing !== null)
    .map((block) => block.missing as string);
}
