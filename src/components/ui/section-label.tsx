import { cn } from '@/lib/utils';

/**
 * Small uppercase group heading. Replaces the
 * `text-xs font-medium uppercase tracking-wide text-muted` string that was
 * repeated at five call sites.
 */
export function SectionLabel({
  className,
  ...props
}: React.ComponentProps<'p'>) {
  return (
    <p
      className={cn(
        'text-eyebrow font-semibold uppercase text-muted',
        className
      )}
      {...props}
    />
  );
}
