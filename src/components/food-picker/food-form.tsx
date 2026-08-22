'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createFood } from '@/actions/foods';
import { Button } from '@/components/ui/button';
import { Card, CardMeta, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { Disclosure } from '@/components/ui/disclosure';
import { parseGermanNumber } from '@/lib/nutrition';
import {
  EMPTY_NUTRIENT_DRAFT,
  NutrientFields,
  basisLabel,
} from './nutrient-fields';

export type TagOption = {
  id: string;
  labelDe: string;
  category: string;
};

/**
 * Tags matter more here than the exact calorie count: an untagged food is
 * invisible to the later analysis, while a missing macro is merely a gap in a
 * chart.
 *
 * Every field is controlled rather than read out of `FormData` on submit. Both
 * the tag groups and the nutrient fieldset sit inside a `Disclosure`, which
 * unmounts its children — so collapsing a panel before pressing Speichern used
 * to drop everything in it, silently, under a success toast.
 */
export function FoodForm({
  tags,
  defaultBarcode,
}: {
  tags: TagOption[];
  defaultBarcode?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [barcode, setBarcode] = useState(defaultBarcode ?? '');
  const [isBeverage, setIsBeverage] = useState(false);
  const [portionGrams, setPortionGrams] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [nutrients, setNutrients] = useState(EMPTY_NUTRIENT_DRAFT);

  const unit = isBeverage ? 'ml' : 'g';
  const portion = parseGermanNumber(portionGrams);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createFood({
        name,
        brand,
        barcode,
        isBeverage,
        defaultPortionGrams: portionGrams,
        tagIds,
        ...nutrients,
      });
      if (result.ok) {
        toast.success('Angelegt');
        router.push(`/foods/${result.foodId}`);
      } else {
        toast.error(result.error);
      }
    });
  }

  function toggleTag(id: string) {
    setTagIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    );
  }

  const triggers = tags.filter((tag) => tag.category === 'trigger');
  const nutrientTags = tags.filter((tag) => tag.category === 'nutrient');
  const groups = tags.filter((tag) => tag.category === 'group');

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card className="space-y-4">
        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            required
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Marke" htmlFor="brand">
          <Input
            id="brand"
            autoComplete="off"
            value={brand}
            onChange={(event) => setBrand(event.target.value)}
          />
        </Field>
        <Field label="Barcode" htmlFor="barcode">
          <Input
            id="barcode"
            inputMode="numeric"
            value={barcode}
            onChange={(event) => setBarcode(event.target.value)}
          />
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-base text-fg">
          <input
            type="checkbox"
            checked={isBeverage}
            onChange={(event) => setIsBeverage(event.target.checked)}
            className="size-5 accent-[var(--color-primary-strong)]"
          />
          Getränk
        </label>
      </Card>

      <Card>
        <CardTitle>Enthält</CardTitle>
        <CardMeta className="mt-1">
          Ohne Kennzeichnung taucht dieses Lebensmittel in der späteren
          Auswertung nicht auf.
        </CardMeta>
        <div className="mt-3 space-y-3">
          <TagGroup
            label="Auslöser-Kandidaten"
            tags={triggers}
            selected={tagIds}
            onToggle={toggleTag}
          />
          <Disclosure label="Ernährungsmuster">
            <TagGroup
              label=""
              tags={nutrientTags}
              selected={tagIds}
              onToggle={toggleTag}
            />
          </Disclosure>
          <Disclosure label="Kategorie">
            <TagGroup
              label=""
              tags={groups}
              selected={tagIds}
              onToggle={toggleTag}
            />
          </Disclosure>
        </div>
      </Card>

      {/* The label carries the chosen reference amount, so the collapsed panel
          already says what the numbers inside it refer to. Having to open it to
          find that out is the misunderstanding this whole feature removes. */}
      <Disclosure label={`Nährwerte ${basisLabel(nutrients, unit, portion)}`}>
        <Card>
          <NutrientFields
            draft={nutrients}
            onChange={setNutrients}
            unit={unit}
            portionGrams={portion}
            portionSlot={
              <Field
                label={
                  nutrients.basisKind === 'portion'
                    ? `Gewicht einer Portion (${unit})`
                    : `Übliche Portion (${unit})`
                }
                htmlFor="defaultPortionGrams"
                hint={
                  nutrients.basisKind === 'portion'
                    ? 'Die Werte oben werden auf dieses Gewicht bezogen. Es ist auch die Menge, die eine Portion später zählt.'
                    : 'Was eine Portion wiegt. Wird beim Erfassen als Menge vorgeschlagen.'
                }
              >
                <Input
                  id="defaultPortionGrams"
                  type="text"
                  inputMode="decimal"
                  value={portionGrams}
                  onChange={(event) => setPortionGrams(event.target.value)}
                  placeholder="optional"
                />
              </Field>
            }
          />
        </Card>
      </Disclosure>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : null}
        Speichern
      </Button>
    </form>
  );
}

function TagGroup({
  label,
  tags,
  selected,
  onToggle,
}: {
  label: string;
  tags: TagOption[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <fieldset className="space-y-2">
      {label ? (
        <legend className="text-eyebrow font-semibold uppercase text-muted">
          {label}
        </legend>
      ) : null}
      <div className="-mx-1 flex flex-wrap gap-2 px-1">
        {tags.map((tag) => (
          <label
            key={tag.id}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line bg-card px-3 text-sm text-fg has-checked:border-primary has-checked:bg-primary has-checked:text-primary-fg"
          >
            <input
              type="checkbox"
              checked={selected.includes(tag.id)}
              onChange={() => onToggle(tag.id)}
              className="sr-only"
            />
            {tag.labelDe}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
