'use client';

import { cn } from '@/lib/utils';

/**
 * The workhorse control of this app. Everything that can be a chip is a chip:
 * on a phone, tapping a large target beats typing, and a meal that takes more
 * than a few taps does not get logged for six months straight.
 */
export function Chip({
  selected = false,
  className,
  ...props
}: React.ComponentProps<'button'> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors',
        selected
          ? 'border-primary bg-primary text-primary-fg'
          : 'border-line bg-card text-fg hover:bg-soft',
        'disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}

export function ChipRow({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('-mx-1 flex flex-wrap gap-2 px-1', className)}
      {...props}
    />
  );
}
