'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Progressive disclosure: the extra controls (amount, reaction, notes) stay
 * folded away so the default path stays at three taps.
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
        className="tap flex w-full items-center justify-between gap-2 rounded-xl px-1 text-left text-sm font-medium text-primary-strong"
      >
        {label}
        <ChevronDown
          aria-hidden
          className={cn('size-4 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open ? <div className="pt-3">{children}</div> : null}
    </div>
  );
}
