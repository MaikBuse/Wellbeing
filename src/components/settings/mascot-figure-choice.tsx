'use client';

import { useOptimistic, useTransition } from 'react';
import { toast } from 'sonner';
import { setMascotCharacter } from '@/actions/settings';
import { resetWalkIn } from '@/components/mascot/dock-visibility';
import {
  CHARACTER_NAME,
  MASCOT_CHARACTERS,
  type MascotCharacter,
} from '@/components/mascot/rive-asset';
import { Chip, ChipRow } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';

/**
 * Which of the two figures stands in the corner.
 *
 * Chips and not the `Select` from `field.tsx`: there are two options, and a row
 * of large targets is what this app is made of — see the header of `chip.tsx`.
 * `Chip` brings `aria-pressed` and `min-h-11` with it, so neither the tap target
 * nor the state announcement is this file's business.
 *
 * THE HINT NAMES THE COLOURS AND THE CHIPS DO NOT. The two figures differ mainly
 * in colour, so two bare names are not a choice anybody can make who has not
 * already seen both of them. That is CLAUDE.md's rule about the severity ramp
 * read from the other side: the label is the name, and the colour is put into
 * words beside it rather than left to the drawing.
 *
 * Re-tapping the chosen figure does nothing, on purpose. It would otherwise cost
 * a write, a revalidation of every route in the group and a fresh companion read
 * to arrive back where it started.
 */
export function MascotFigureChoice({
  value,
  parentEnabled,
}: {
  value: MascotCharacter;
  parentEnabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(value);

  function choose(next: MascotCharacter) {
    if (next === optimistic) return;
    startTransition(async () => {
      setOptimistic(next);
      /*
       * The other figure is somebody else arriving, not the same one changing
       * colour — the canvas is keyed on the choice, so it really is a new
       * instance. Without this the walk-in would be suppressed as "he is
       * already here" and the new figure would simply appear standing.
       */
      resetWalkIn();
      const result = await setMascotCharacter({ mascotCharacter: next });
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <div
      className={`border-l border-line pl-3 ${parentEnabled ? '' : 'opacity-60'}`}
    >
      <Field
        label="Figur"
        hint="Merv ist amber und liegt auf der Farbe der App, Orson violett."
      >
        <ChipRow>
          {MASCOT_CHARACTERS.map((character) => (
            <Chip
              key={character}
              selected={optimistic === character}
              disabled={pending || !parentEnabled}
              onClick={() => choose(character)}
            >
              {CHARACTER_NAME[character]}
            </Chip>
          ))}
        </ChipRow>
      </Field>
    </div>
  );
}
