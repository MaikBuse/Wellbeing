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
 */
export function Disclosure({
  label,
  children,
  className,
  defaultOpen = false,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="tap flex w-full items-center justify-between gap-2 rounded-control px-1 py-2 text-left text-sm font-medium text-primary-strong transition-colors duration-120 hover:bg-primary-tint"
      >
        {label}
        <ChevronDown
          aria-hidden
          className={cn(
            'size-4 transition-transform duration-200 ease-out-soft',
            open && 'rotate-180'
          )}
        />
      </button>
      {open ? <div className="animate-rise pt-3">{children}</div> : null}
    </div>
  );
}
