import { cn } from '@/lib/utils';

/**
 * One metric: value, optional unit, and a label that is never optional.
 *
 * The label is required by the same rule that governs the severity ramp — a
 * bare coloured number is not a readable value.
 */
export function Stat({
  value,
  unit,
  label,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  value: React.ReactNode;
  unit?: string;
  label: string;
}) {
  return (
    <div className={cn('min-w-0', className)} {...props}>
      <p className="flex items-baseline gap-1">
        <span className="num text-section font-semibold text-fg">{value}</span>
        {unit ? <span className="text-xs text-muted">{unit}</span> : null}
      </p>
      <p className="truncate text-xs text-muted">{label}</p>
    </div>
  );
}

export function StatGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex items-start justify-between gap-4', className)}
      {...props}
    />
  );
}
