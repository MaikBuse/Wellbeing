import { cn } from '@/lib/utils';

/**
 * Loading placeholder. Pulses via opacity rather than a sweeping gradient: a
 * travelling highlight across a full screen of placeholders is a lot of motion
 * for something the user is only waiting on.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-pulse rounded-control bg-line-soft',
        className
      )}
      {...props}
    />
  );
}
