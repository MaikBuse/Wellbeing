import { Lock } from 'lucide-react';
import { formatLogDateShort } from '@/lib/time';
import { isAchieved, type Milestone } from '@/services/progress/milestones';
import { cn } from '@/lib/utils';

/**
 * One milestone.
 *
 * Achieved medals draw their ring as an SVG stroke, reusing the `check`
 * keyframe that already exists for the medication tick — the ring completes
 * itself on first paint and then stays. Open ones show a lock and the honest
 * remainder ("noch 4 Tage"), because a badge that only says "locked" tells
 * nobody what to do about it.
 *
 * The state is never colour alone: an achieved medal carries a date, an open
 * one carries a count.
 */
export function MilestoneMedal({
  milestone,
  index = 0,
}: {
  milestone: Milestone;
  /** Position in the list, for the staggered entrance. */
  index?: number;
}) {
  const achieved = isAchieved(milestone);
  const remaining = Math.max(0, milestone.need - milestone.have);
  const share =
    milestone.need > 0 ? Math.min(1, milestone.have / milestone.need) : 0;

  return (
    <li
      className={cn(
        'rise-in flex gap-3 rounded-control border p-3',
        achieved
          ? 'border-line bg-card shadow-hairline'
          : 'border-line-soft bg-bg-sunken'
      )}
      style={{ '--i': index } as React.CSSProperties}
    >
      <Ring achieved={achieved} share={share} />

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-sm font-semibold',
            achieved ? 'text-fg' : 'text-muted'
          )}
        >
          {milestone.title}
        </p>
        <p className="mt-0.5 text-xs text-muted">{milestone.description}</p>
        <p className="mt-1 text-xs font-medium text-primary-strong">
          {achieved ? (
            <>
              erreicht am{' '}
              <span className="num">
                {formatLogDateShort(milestone.achievedOn as string)}
              </span>
            </>
          ) : (
            <>
              noch <span className="num">{remaining}</span> {milestone.unit}
            </>
          )}
        </p>
      </div>
    </li>
  );
}

function Ring({ achieved, share }: { achieved: boolean; share: number }) {
  const size = 44;
  const radius = 18;
  const circumference = 2 * Math.PI * radius;

  return (
    <span
      className="relative grid size-11 shrink-0 place-items-center"
      aria-hidden
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={3}
          className="stroke-line"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - (achieved ? 1 : share))}
          className={achieved ? 'stroke-primary' : 'stroke-line-strong'}
          // The dash length the `check` keyframe animates from.
          style={
            achieved
              ? ({
                  '--dash': circumference,
                  animation: 'var(--animate-check)',
                } as React.CSSProperties)
              : undefined
          }
        />
      </svg>
      {achieved ? (
        <span className="font-display text-sm font-semibold text-primary-strong">
          ✓
        </span>
      ) : (
        <Lock className="size-4 text-muted" strokeWidth={1.8} />
      )}
    </span>
  );
}
