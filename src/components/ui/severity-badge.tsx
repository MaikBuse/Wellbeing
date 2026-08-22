import { severityToken } from '@/lib/scales';
import { cn } from '@/lib/utils';

/**
 * The single source of truth for the severity ramp -> class mapping.
 *
 * This map previously existed as a verbatim copy in both score-chips.tsx and
 * meal-slot-card.tsx, which meant a palette change had to be made twice.
 */
export const SEVERITY_RAMP: Record<string, string> = {
  'sev-0': 'bg-sev-0 text-fg',
  'sev-1': 'bg-sev-1 text-fg',
  'sev-2': 'bg-sev-2 text-primary-fg',
  'sev-3': 'bg-sev-3 text-primary-fg',
  'sev-4': 'bg-sev-4 text-white',
};

export function severityClasses(value: number): string {
  return SEVERITY_RAMP[severityToken(value)];
}

/**
 * A severity as a coloured disc with the number inside.
 *
 * The number is not optional: rose and apricot sit close together on the colour
 * wheel, so the colour never carries the value on its own.
 */
export function SeverityBadge({
  value,
  className,
  ...props
}: React.ComponentProps<'span'> & { value: number }) {
  return (
    <span
      className={cn(
        'num inline-flex size-6 shrink-0 items-center justify-center rounded-pill text-xs font-semibold',
        severityClasses(value),
        className
      )}
      {...props}
    >
      {value}
    </span>
  );
}
