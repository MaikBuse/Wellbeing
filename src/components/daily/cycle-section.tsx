'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { logMenstrualEvent } from '@/actions/dailyLog';
import { Chip, ChipRow } from '@/components/ui/chip';
import { Disclosure } from '@/components/ui/disclosure';
import { Field } from '@/components/ui/field';

/**
 * Cycle logging.
 *
 * `logMenstrualEvent` has existed since phase 1 with no caller at all, so the
 * cycle — which the README names as a tracked confounder — was in fact
 * uncollectable. RA symptoms shift with it, which makes this the difference
 * between having that confounder and not having it.
 *
 * Events, never a cycle day: `daily.ts` is explicit that day and phase are
 * derived, because a hand-typed cycle day rots within weeks. Three taps, no
 * numbers to keep straight.
 *
 * Insert-only and idempotent — the action is `onConflictDoNothing` on
 * (user, date, kind), so a double tap is a no-op rather than an error.
 */
const EVENTS = [
  { kind: 'period_start' as const, label: 'Periode beginnt' },
  { kind: 'period_end' as const, label: 'Periode endet' },
  { kind: 'spotting' as const, label: 'Zwischenblutung' },
];

export function CycleSection({
  logDate,
  recorded,
}: {
  logDate: string;
  recorded: string[];
}) {
  const [pending, startTransition] = useTransition();

  function log(kind: (typeof EVENTS)[number]['kind']) {
    startTransition(async () => {
      const result = await logMenstrualEvent({ eventDate: logDate, kind });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Eingetragen.');
    });
  }

  return (
    <Disclosure label="Zyklus">
      <Field
        label="Was war heute"
        hint="Zyklustag und Phase werden daraus berechnet – von Hand eingetragen wären sie in wenigen Wochen falsch."
      >
        <ChipRow>
          {EVENTS.map((event) => (
            <Chip
              key={event.kind}
              selected={recorded.includes(event.kind)}
              disabled={pending}
              onClick={() => log(event.kind)}
            >
              {event.label}
            </Chip>
          ))}
        </ChipRow>
      </Field>
    </Disclosure>
  );
}
