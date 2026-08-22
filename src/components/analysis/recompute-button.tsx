'use client';

import { useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { recomputeSuspicionRanking } from '@/actions/analysis';
import { Button } from '@/components/ui/button';

/**
 * Recompute on demand.
 *
 * There is deliberately no cooldown. The guard against reading too much into a
 * fresh run is the stability badge on each factor, not a locked button — a lock
 * would only be an obstacle, while "hält sich seit 3 Wochen" is information.
 */
export function RecomputeButton({ hasRun }: { hasRun: boolean }) {
  const [pending, startTransition] = useTransition();

  function recompute() {
    startTransition(async () => {
      const result = await recomputeSuspicionRanking();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Auswertung neu berechnet.');
    });
  }

  return (
    <Button
      variant={hasRun ? 'outline' : 'primary'}
      size="sm"
      onClick={recompute}
      disabled={pending}
    >
      <RefreshCw
        aria-hidden
        className={pending ? 'size-4 animate-spin' : 'size-4'}
      />
      {pending ? 'Berechnet …' : hasRun ? 'Neu berechnen' : 'Auswertung starten'}
    </Button>
  );
}
