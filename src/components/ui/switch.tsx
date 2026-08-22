'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

/**
 * Radix Switch. The package was already a dependency with no imports anywhere,
 * so this costs no bundle growth.
 *
 * The track is 44px wide and the whole control clears the tap-target floor.
 */
export function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill border border-line transition-colors duration-200 ease-out-soft',
        'data-[state=checked]:border-primary-strong data-[state=checked]:bg-primary',
        'data-[state=unchecked]:bg-bg-sunken',
        'disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-5 rounded-pill bg-card shadow-hairline transition-transform duration-200 ease-out-soft',
          'translate-x-1 data-[state=checked]:translate-x-6'
        )}
      />
    </SwitchPrimitive.Root>
  );
}
