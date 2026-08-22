'use client';

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { updateFoodNutrients } from '@/actions/foods';
import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import type { Per100 } from '@/lib/nutrition';
import {
  NutrientFields,
  basisLabel,
  nutrientDraftFrom,
  resolveDraft,
} from './nutrient-fields';

/**
 * Correcting the stored nutrients, on whatever basis the label states them.
 *
 * There was no way to change a nutrient at all before this: nothing called the
 * per-field action, and `food_name_uq` is globally unique, so a food entered
 * with the wrong numbers could not even be worked around by entering it again
 * under the same name. A reference-amount picker without this would be a trap —
 * pick the wrong unit once and the food stays wrong forever.
 *
 * Deliberately NOT retroactive, which is the mirror image of the tag editor two
 * cards down: nutrients on `meal_item` are a frozen snapshot of what was known
 * when the meal was logged, and tags are a correction of knowledge that is meant
 * to reach backwards. Both statements are on screen because the asymmetry is
 * intentional and invisible otherwise.
 */
export function NutrientEditor({
  foodId,
  food,
  basisUnit,
  portionGrams,
}: {
  foodId: string;
  food: Per100;
  basisUnit: 'g' | 'ml';
  portionGrams: number | null;
}) {
  const initial = nutrientDraftFrom(food);
  const [draft, setDraft] = useState(initial);
  const [pending, startTransition] = useTransition();

  const dirty = Object.keys(initial).some(
    (key) =>
      draft[key as keyof typeof draft] !== initial[key as keyof typeof initial]
  );
  const resolved = resolveDraft(draft, basisUnit, portionGrams);

  function save() {
    startTransition(async () => {
      const stored = resolved.ok ? resolved.values : null;
      const result = await updateFoodNutrients({ foodId, ...draft });
      if (result.ok) {
        toast.success('Nährwerte gespeichert');
        // Snap the fields back onto the stored per-100 values. Leaving the
        // entered numbers standing while the basis resets to "je 100" would
        // print per-gram figures under a per-100 heading, which is the exact
        // confusion this feature exists to remove.
        if (stored) setDraft(nutrientDraftFrom(stored));
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Disclosure label={`Nährwerte ändern – ${basisLabel(draft, basisUnit, portionGrams)}`}>
      <div className="space-y-4">
        <NutrientFields
          draft={draft}
          onChange={setDraft}
          unit={basisUnit}
          portionGrams={portionGrams}
          disabled={pending}
        />
        {dirty ? (
          <Button
            onClick={save}
            disabled={pending || !resolved.ok}
            className="w-full"
          >
            {pending ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : null}
            Nährwerte speichern
          </Button>
        ) : null}
      </div>
    </Disclosure>
  );
}
