'use client';

import { useState, useTransition } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { deleteSymptomEntry } from '@/actions/symptoms';
import { Button } from '@/components/ui/button';
import { SeverityBadge } from '@/components/ui/severity-badge';
import type { DayReaction } from '@/db/queries/day';
import { ONSET_LAG_LABELS, type OnsetLagKey } from '@/lib/scales';
import { cn } from '@/lib/utils';

/**
 * One recorded symptom entry, and the way to get rid of it.
 *
 * The meal-bound reactions and the meal-less complaints are the same
 * `symptom_entry` row and used to be two copies of the same markup, in
 * meal-slot-section and in day-view. They are one component now, because the
 * delete affordance had to be added to both.
 *
 * Deleting confirms in place rather than immediately. A wrongly removed meal
 * item is one tap to re-add; a reaction is four questions — what, how strong,
 * when, and the note that often carries the actual signal.
 *
 * The time and the note are shown for the same reason: two entries with the
 * same severity and the same symptom are otherwise indistinguishable, and then
 * there is no way to tell which one the trash icon belongs to.
 */
export function SymptomEntryRow({
  entry,
  time,
  fallbackLabel,
  index = 0,
  className,
  readOnly = false,
}: {
  entry: DayReaction;
  /** 'HH:MM' in the user's zone, formatted on the server. */
  time: string;
  /** Shown when no symptom type was picked — the severity alone is the entry. */
  fallbackLabel: string;
  /** Position in the list, used only for the entrance stagger. */
  index?: number;
  className?: string;
  readOnly?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const label =
    entry.symptoms.length > 0 ? entry.symptoms.join(', ') : fallbackLabel;

  function remove() {
    startTransition(async () => {
      const result = await deleteSymptomEntry(entry.id);
      if (result.ok) toast.success('Gelöscht');
      else {
        toast.error(result.error);
        setConfirming(false);
      }
    });
  }

  return (
    <li
      className={cn(
        'rise-in flex flex-wrap items-center gap-2 rounded-control px-3 py-2 text-sm',
        className
      )}
      style={{ '--i': index } as React.CSSProperties}
    >
      <SeverityBadge value={entry.severity} />

      <div className="min-w-0 flex-1">
        <p className="text-fg">
          {label}
          {entry.onsetLag ? (
            <span className="text-muted">
              {' · '}
              {ONSET_LAG_LABELS[entry.onsetLag as OnsetLagKey] ??
                entry.onsetLag}
            </span>
          ) : null}
          {time ? (
            <span className="num text-muted">
              {' · '}
              {time}
            </span>
          ) : null}
        </p>
        {entry.note ? (
          <p className="mt-0.5 text-xs text-muted">{entry.note}</p>
        ) : null}
      </div>

      {readOnly ? null : confirming ? (
        // w-full puts the confirm bar on its own line inside the wrapping row,
        // so the entry it belongs to stays readable above it and both buttons
        // keep their full width.
        <span className="flex w-full items-center justify-end gap-2">
          <span className="mr-auto text-xs text-muted">Löschen?</span>
          <Button variant="danger" onClick={remove} disabled={pending}>
            {pending ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : null}
            Löschen
          </Button>
          <Button
            variant="ghost"
            onClick={() => setConfirming(false)}
            disabled={pending}
          >
            Abbrechen
          </Button>
        </span>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={() => setConfirming(true)}
          aria-label={`${label} löschen`}
        >
          <Trash2 aria-hidden className="size-4 text-muted" />
        </Button>
      )}
    </li>
  );
}
