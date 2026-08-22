'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Chip, ChipRow } from '@/components/ui/chip';
import { cn } from '@/lib/utils';

/**
 * The one filter row, above everything it scopes.
 *
 * Presets rather than a calendar: nobody fights a date grid for "the last 90
 * days", and the useful windows here are few. The value lives in the URL so
 * every section renders against the same slice and the numbers always agree.
 *
 * The client never computes a day. `todayLogDate()` in a client component would
 * ignore the user's `dayStartHour` and would be a hydration mismatch across the
 * 04:00 boundary, so this only writes a preset NAME and the server resolves it.
 *
 * While the new slice streams in, the previous render is held at reduced
 * opacity — no skeleton flash, no layout jump. That is what `isPending` from
 * `useTransition` is for here.
 */
export const RANGE_PRESETS = [
  { value: '30', label: '30 Tage' },
  { value: '90', label: '90 Tage' },
  { value: '180', label: '180 Tage' },
  { value: 'all', label: 'Alles' },
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number]['value'];

export function RangeFilter({
  current,
  children,
}: {
  current: RangePreset;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function select(value: RangePreset) {
    const next = new URLSearchParams(params.toString());
    next.set('range', value);
    startTransition(() => {
      router.replace(`?${next.toString()}`, { scroll: false });
    });
  }

  return (
    <>
      <ChipRow aria-label="Zeitraum">
        {RANGE_PRESETS.map((preset) => (
          <Chip
            key={preset.value}
            selected={preset.value === current}
            onClick={() => select(preset.value)}
          >
            {preset.label}
          </Chip>
        ))}
      </ChipRow>

      <div
        className={cn(
          'transition-opacity duration-200 ease-out-soft',
          pending && 'opacity-60'
        )}
      >
        {children}
      </div>
    </>
  );
}
