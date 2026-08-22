import { cn } from '@/lib/utils';

/**
 * Completion as a ring with the count in the middle.
 *
 * The svg is aria-hidden and the figure is real text on top of it, so the value
 * is readable rather than being encoded in an arc length. `label` is what a
 * screen reader gets instead of the geometry.
 */
export function ProgressRing({
  value,
  max,
  label,
  size = 48,
  strokeWidth = 4,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  value: number;
  max: number;
  label: string;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const complete = max > 0 && value >= max;

  return (
    <div
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size }}
      {...props}
    >
      <svg
        aria-hidden
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-line"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - share)}
          className={cn(
            'transition-[stroke-dashoffset] duration-450 ease-out-soft',
            complete ? 'stroke-ok' : 'stroke-primary'
          )}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="num text-sm font-semibold text-fg">{value}</span>
        <span className="sr-only"> von {max} — {label}</span>
      </span>
    </div>
  );
}
