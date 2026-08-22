'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createFood } from '@/actions/foods';
import { Button } from '@/components/ui/button';
import { Card, CardMeta, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { Disclosure } from '@/components/ui/disclosure';

export type TagOption = {
  id: string;
  labelDe: string;
  category: string;
};

/**
 * Tags matter more here than the exact calorie count: an untagged food is
 * invisible to the later analysis, while a missing macro is merely a gap in a
 * chart.
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

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await createFood(formData);
      if (result.ok) {
        toast.success('Angelegt');
        router.push(`/foods/${result.foodId}`);
      } else {
        toast.error(result.error);
      }
    });
  }

  const triggers = tags.filter((tag) => tag.category === 'trigger');
  const nutrients = tags.filter((tag) => tag.category === 'nutrient');
  const groups = tags.filter((tag) => tag.category === 'group');

  return (
    <form action={submit} className="space-y-4">
      <Card className="space-y-4">
        <Field label="Name" htmlFor="name">
          <Input id="name" name="name" required autoComplete="off" />
        </Field>
        <Field label="Marke" htmlFor="brand">
          <Input id="brand" name="brand" autoComplete="off" />
        </Field>
        <Field label="Barcode" htmlFor="barcode">
          <Input
            id="barcode"
            name="barcode"
            inputMode="numeric"
            defaultValue={defaultBarcode}
          />
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-base text-fg">
          <input
            type="checkbox"
            name="isBeverage"
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
          <TagGroup label="Auslöser-Kandidaten" tags={triggers} />
          <Disclosure label="Ernährungsmuster">
            <TagGroup label="" tags={nutrients} />
          </Disclosure>
          <Disclosure label="Kategorie">
            <TagGroup label="" tags={groups} />
          </Disclosure>
        </div>
      </Card>

      <Disclosure label="Nährwerte pro 100 g / 100 ml">
        <Card className="space-y-3">
          {(
            [
              ['kcal100', 'Kalorien (kcal)'],
              ['protein100', 'Eiweiß (g)'],
              ['fat100', 'Fett (g)'],
              ['carbs100', 'Kohlenhydrate (g)'],
              ['sugar100', 'davon Zucker (g)'],
              ['fiber100', 'Ballaststoffe (g)'],
              ['salt100', 'Salz (g)'],
              ['defaultPortionGrams', 'Übliche Portion (g)'],
            ] as const
          ).map(([name, label]) => (
            <Field key={name} label={label} htmlFor={name}>
              <Input
                id={name}
                name={name}
                type="text"
                inputMode="decimal"
                placeholder="optional"
              />
            </Field>
          ))}
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

function TagGroup({ label, tags }: { label: string; tags: TagOption[] }) {
  return (
    <fieldset className="space-y-2">
      {label ? (
        <legend className="text-xs font-medium uppercase tracking-wide text-muted">
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
              name="tagIds"
              value={tag.id}
              className="sr-only"
            />
            {tag.labelDe}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
