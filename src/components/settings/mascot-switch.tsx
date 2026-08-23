'use client';

import { useOptimistic, useTransition } from 'react';
import { toast } from 'sonner';
import { setShowMascot } from '@/actions/settings';
import { Switch } from '@/components/ui/switch';

/**
 * Turns the companion off — the reading of the day AND the drawing of it.
 *
 * Worth its own flag: everything else on the nutrient screens is a number, and
 * a number that is inconvenient is still information. A companion that comments
 * on them is the one element here that some days is simply not wanted, and
 * there would otherwise be no way to say so.
 *
 * `MascotFigureSwitch` sits under this one and takes away only the figure. So
 * the subtitle here has to describe the whole thing rather than the drawing —
 * it used to say "Die Figur", which is now the name of the row below.
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
          Ordnet den Tag ein und schlägt einen nächsten Schritt vor — als Satz
          im Tagesüberblick und als Figur in der Ecke.
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
