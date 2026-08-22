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
        'inline-flex min-h-11 items-center gap-1.5 rounded-pill border px-3.5 text-sm font-medium',
        'transition-[background-color,border-color,color,transform] duration-120 ease-out-soft',
        'active:scale-[0.96]',
        selected
          ? 'animate-pop border-primary-strong bg-primary text-primary-fg'
          : // border-line-strong, not border-line: a hairline border on the pale
            // background makes a live chip read as a disabled one.
            'border-line-strong bg-card text-fg hover:border-primary-strong hover:bg-primary-tint',
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
