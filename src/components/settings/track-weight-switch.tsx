'use client';

import { useOptimistic, useTransition } from 'react';
import { toast } from 'sonner';
import { setTrackWeight } from '@/actions/settings';
import { Switch } from '@/components/ui/switch';

/**
 * The only user setting with a UI. Optimistic so the toggle moves on tap rather
 * than after the round trip — a switch that lags reads as broken.
 */
export function TrackWeightSwitch({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(enabled);

  function toggle(next: boolean) {
    startTransition(async () => {
      setOptimistic(next);
      const result = await setTrackWeight({ trackWeight: next });
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <label className="flex items-center justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg">
          Gewicht mitverfolgen
        </span>
        <span className="block text-xs text-muted">
          Blendet das Gewichtsfeld im Tagescheck ein oder aus.
        </span>
      </span>
      <Switch
        checked={optimistic}
        onCheckedChange={toggle}
        disabled={pending}
        aria-label="Gewicht mitverfolgen"
      />
    </label>
  );
}
