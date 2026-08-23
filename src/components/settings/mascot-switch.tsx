'use client';

import { useOptimistic, useTransition } from 'react';
import { toast } from 'sonner';
import { setShowMascot } from '@/actions/settings';
import { Switch } from '@/components/ui/switch';

/**
 * Turns the mascot off.
 *
 * Worth its own flag: everything else on the nutrient screens is a number, and
 * a number that is inconvenient is still information. A character with a face
 * is the one element here that some days is simply not wanted, and there would
 * otherwise be no way to say so.
 *
 * Optimistic, like the other two switches — one that lags reads as broken.
 */
export function MascotSwitch({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(enabled);

  function toggle(next: boolean) {
    startTransition(async () => {
      setOptimistic(next);
      const result = await setShowMascot({ showMascot: next });
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <label className="flex items-center justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg">Begleiter zeigen</span>
        <span className="block text-xs text-muted">
          Die Figur, die den Tag einordnet und einen nächsten Schritt vorschlägt.
        </span>
      </span>
      <Switch
        checked={optimistic}
        onCheckedChange={toggle}
        disabled={pending}
        aria-label="Begleiter zeigen"
      />
    </label>
  );
}
