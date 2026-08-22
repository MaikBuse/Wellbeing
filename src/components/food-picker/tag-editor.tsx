'use client';

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { updateFoodTags } from '@/actions/foods';
import { Button } from '@/components/ui/button';
import { Chip, ChipRow } from '@/components/ui/chip';
import type { TagOption } from './food-form';
import { SectionLabel } from '@/components/ui/section-label';

/**
 * Re-tagging applies retroactively, on purpose: it is a correction of knowledge
 * ("this contains hidden lactose"), and applying it to past meals is the whole
 * point of the exercise. Nutrients behave the opposite way — they stay frozen.
 */
export function TagEditor({
  foodId,
  allTags,
  selected,
}: {
  foodId: string;
  allTags: TagOption[];
  selected: string[];
}) {
  const [current, setCurrent] = useState(selected);
  const [pending, startTransition] = useTransition();
  const dirty =
    current.length !== selected.length ||
    current.some((id) => !selected.includes(id));

  function toggle(id: string) {
    setCurrent((value) =>
      value.includes(id) ? value.filter((v) => v !== id) : [...value, id]
    );
  }

  function save() {
    startTransition(async () => {
      const result = await updateFoodTags({ foodId, tagIds: current });
      if (result.ok) toast.success('Kennzeichnung gespeichert');
      else toast.error(result.error);
    });
  }

  const byCategory = [
    ['trigger', 'Auslöser-Kandidaten'],
    ['nutrient', 'Ernährungsmuster'],
    ['group', 'Kategorie'],
  ] as const;

  return (
    <div className="space-y-4">
      {byCategory.map(([category, label]) => {
        const tags = allTags.filter((tag) => tag.category === category);
        if (tags.length === 0) return null;
        return (
          <div key={category} className="space-y-2">
            <SectionLabel>{label}</SectionLabel>
            <ChipRow>
              {tags.map((tag) => (
                <Chip
                  key={tag.id}
                  selected={current.includes(tag.id)}
                  onClick={() => toggle(tag.id)}
                >
                  {tag.labelDe}
                </Chip>
              ))}
            </ChipRow>
          </div>
        );
      })}

      {dirty ? (
        <Button onClick={save} disabled={pending} className="w-full">
          {pending ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : null}
          Kennzeichnung speichern
        </Button>
      ) : null}
    </div>
  );
}
