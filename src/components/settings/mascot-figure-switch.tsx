'use client';

import { useOptimistic, useTransition } from 'react';
import { toast } from 'sonner';
import { setShowMascotFigure } from '@/actions/settings';
import { Switch } from '@/components/ui/switch';

/**
 * The narrower half of the companion question.
 *
 * `MascotSwitch` above decides whether there is a companion at all; this one
 * decides whether he is drawn. Off, the reading of the day stays exactly where
 * it is readable — as the sentence in the day overview and on the progress
 * screen — and the corner is simply empty.
 *
 * The same toggle lives in the header on every screen (`mascot-toggle.tsx`),
 * which is where it is actually used. This row exists because settings is where
 * someone looks for a switch they half-remember, and because a control that can
 * only be reached from the thing it hides is a control you cannot find once you
 * have hidden it.
 *
 * `disabled` follows the parent: a sub-switch under a companion that is off
 * cannot do anything, and one that looks live but is not is worse than one that
 * says so.
 */
export function MascotFigureSwitch({
  enabled,
  parentEnabled,
}: {
  enabled: boolean;
  parentEnabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(enabled);

  function toggle(next: boolean) {
    startTransition(async () => {
      setOptimistic(next);
      const result = await setShowMascotFigure({ showMascotFigure: next });
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <label
      className={`flex items-center justify-between gap-4 border-l border-line pl-3 ${
        parentEnabled ? '' : 'opacity-60'
      }`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg">
          Figur in der Ecke
        </span>
        <span className="block text-xs text-muted">
          Orson steht unten rechts auf der Leiste. Ohne ihn bleibt die
          Einordnung als Text.
        </span>
      </span>
      <Switch
        checked={optimistic}
        onCheckedChange={toggle}
        disabled={pending || !parentEnabled}
        aria-label="Figur in der Ecke"
      />
    </label>
  );
}
