'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Progressive disclosure: the extra controls (amount, reaction, notes) stay
 * folded away so the default path stays at three taps.
 *
 * Children stay conditionally mounted rather than hidden behind a height
 * transition. The symptom picker alone is 47 chips in 6 groups; keeping that
 * mounted on every meal card to buy a collapse animation is the worse trade.
 * The open state animates in instead.
 *
 * Pass `open` and `onOpenChange` to control it from outside — the reaction form
 * needs to close itself once it is done, whether it saved something or not.
 */
export function Disclosure({
  label,
  children,
  className,
  defaultOpen = false,
  open,
  onOpenChange,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const isOpen = open ?? uncontrolled;

  function toggle() {
    const next = !isOpen;
    if (open === undefined) setUncontrolled(next);
    onOpenChange?.(next);
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        className="tap flex w-full items-center justify-between gap-2 rounded-control px-1 py-2 text-left text-sm font-medium text-primary-strong transition-colors duration-120 hover:bg-primary-tint"
      >
        {label}
        <ChevronDown
          aria-hidden
          className={cn(
            'size-4 transition-transform duration-200 ease-out-soft',
            isOpen && 'rotate-180'
          )}
        />
      </button>
      {isOpen ? <div className="animate-rise pt-3">{children}</div> : null}
    </div>
  );
}
