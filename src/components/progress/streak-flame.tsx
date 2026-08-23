import { Flame } from 'lucide-react';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { cn } from '@/lib/utils';

/**
 * The streak, as a flame with the number beside it.
 *
 * The flame grows warmer with the run, but the run length is ALWAYS printed
 * next to it — the app's rule that colour never carries a value on its own
 * applies here as much as it does to the severity ramp. Someone who cannot tell
 * apricot from rose still reads "23 Tage".
 *
 * A cold streak gets the sunken surface and a muted icon rather than a red or
 * broken one. Nothing here scolds: a run that ended is an invitation, not a
 * penalty, and on a flare day it is not even a failure.
 */
export type FlameSize = 'sm' | 'lg';

const TIERS = [
  {
    min: 100,
    disc: 'from-primary-press to-sev-4',
    ring: 'ring-primary-strong/25',
  },
  { min: 30, disc: 'from-primary to-secondary', ring: 'ring-primary/25' },
  { min: 7, disc: 'from-soft to-primary', ring: 'ring-primary/20' },
  { min: 1, disc: 'from-soft to-soft-hover', ring: 'ring-soft' },
] as const;

function tierFor(streak: number) {
  return TIERS.find((tier) => streak >= tier.min) ?? null;
}

export function StreakFlame({
  streak,
  size = 'lg',
  className,
}: {
  streak: number;
  size?: FlameSize;
  className?: string;
}) {
  const tier = tierFor(streak);
  const large = size === 'lg';

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span
        className={cn(
          'relative isolate grid shrink-0 place-items-center rounded-pill ring-1',
          large ? 'size-14' : 'size-11',
          tier
            ? cn('bg-gradient-to-br text-primary-fg', tier.disc, tier.ring)
            : 'bg-bg-sunken text-muted ring-line'
        )}
      >
        {tier ? (
          // Purely decorative warmth behind the icon. The global
          // prefers-reduced-motion switch stops it; nothing is lost when it does,
          // because the disc keeps its colour either way.
          <span
            aria-hidden
            className="animate-flicker absolute inset-0 -z-10 rounded-pill bg-primary/35 blur-md"
          />
        ) : null}
        <Flame
          aria-hidden
          className={large ? 'size-7' : 'size-5'}
          strokeWidth={tier ? 2.2 : 1.8}
        />
      </span>

      <p className="min-w-0">
        <span className="flex items-baseline gap-1">
          <AnimatedNumber
            value={streak}
            className={cn(
              'font-display font-semibold text-fg',
              large ? 'text-metric' : 'text-section'
            )}
          />
          <span className="text-sm text-muted">
            {streak === 1 ? 'Tag' : 'Tage'}
          </span>
        </span>
        <span className="block truncate text-xs text-muted">
          {streak > 0 ? 'in Folge erfasst' : 'noch keine Serie'}
        </span>
      </p>
    </div>
  );
}
