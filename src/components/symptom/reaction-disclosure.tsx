'use client';

import { useState } from 'react';
import { Disclosure } from '@/components/ui/disclosure';
import {
  ReactionSheet,
  type SymptomTypeOption,
} from '@/components/symptom/reaction-sheet';
import type { OnsetLagKey } from '@/lib/scales';

/**
 * Owns the open state of a reaction form so the form can close itself.
 *
 * Both endings need it: "Keine" writes nothing and has no other way of
 * acknowledging the tap, and a saved reaction should fold away rather than sit
 * there looking as if it still needs submitting.
 */
export function ReactionDisclosure({
  label,
  mealId,
  defaultLag = null,
  symptomTypes,
}: {
  label: string;
  mealId: string | null;
  defaultLag?: OnsetLagKey | null;
  symptomTypes: SymptomTypeOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Disclosure label={label} open={open} onOpenChange={setOpen}>
      <ReactionSheet
        // Remounts on close, so a half-filled form is not waiting when the
        // section is opened again.
        key={String(open)}
        mealId={mealId}
        defaultLag={defaultLag}
        symptomTypes={symptomTypes}
        onDone={() => setOpen(false)}
      />
    </Disclosure>
  );
}
