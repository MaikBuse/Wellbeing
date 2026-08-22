'use client';

import { useOptimistic, useTransition } from 'react';
import { toast } from 'sonner';
import { setCountTraceExposure } from '@/actions/settings';
import { Switch } from '@/components/ui/switch';

/**
 * Whether "traces of soy" counts as having eaten soy.
 *
 * `deriveTags` marks OFF `off_trace` matches with confidence `trace`, and two
 * grams of soy lecithin is not a soy day. Where that line sits is a judgement
 * rather than a fact, so it belongs to her — the column has existed since phase
 * 1 with nothing able to write it.
 *
 * The hint says out loud that this changes the analysis rather than the view:
 * the flag goes into `analysis_run.params`, so a stored ranking computed with
 * the other setting is answering a different question.
 */
export function TraceExposureSwitch({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(enabled);

  function toggle(next: boolean) {
    startTransition(async () => {
      setOptimistic(next);
      const result = await setCountTraceExposure({ countTraceExposure: next });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Gespeichert. Die Auswertung muss neu berechnet werden.');
    });
  }

  return (
    <label className="flex items-center justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg">
          Spuren als Exposition zählen
        </span>
        <span className="block text-xs text-muted">
          „Kann Spuren von Soja enthalten“ zählt dann wie Soja. Ändert das
          Verdachts-Ranking – danach neu berechnen.
        </span>
      </span>
      <Switch
        checked={optimistic}
        onCheckedChange={toggle}
        disabled={pending}
        aria-label="Spuren als Exposition zählen"
      />
    </label>
  );
}
