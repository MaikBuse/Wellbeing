import { notFound } from 'next/navigation';
import { requireUser } from '@/auth.helpers';
import { allTagDefs, getFoodDetail } from '@/db/queries/foods';
import { Card, CardMeta, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { TagEditor } from '@/components/food-picker/tag-editor';
import { formatGrams, formatKcal } from '@/lib/nutrition';

export const metadata = { title: 'Lebensmittel – Wellbeing' };

export default async function FoodDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const [detail, tags] = await Promise.all([getFoodDetail(id), allTagDefs()]);
  if (!detail) notFound();
  const { food, portions } = detail;

  const rows: [string, string][] = [
    ['Kalorien', formatKcal(food.kcal100)],
    ['Eiweiß', formatGrams(food.protein100)],
    ['Fett', formatGrams(food.fat100)],
    ['Kohlenhydrate', formatGrams(food.carbs100)],
    ['davon Zucker', formatGrams(food.sugar100)],
    ['Ballaststoffe', formatGrams(food.fiber100)],
    ['Salz', formatGrams(food.salt100)],
  ];

  return (
    <main className="space-y-4 p-4">
      <PageHeader
        title={food.name}
        description={
          [food.brand, food.barcode].filter(Boolean).join(' · ') ||
          'Selbst angelegt'
        }
      />

      <Card>
        <CardTitle>
          Nährwerte je 100 {food.basisUnit === 'ml' ? 'ml' : 'g'}
        </CardTitle>
        <CardMeta className="mt-1">
          {food.source === 'off'
            ? 'Aus Open Food Facts übernommen – die Werte sind gerundet und nicht immer korrekt.'
            : 'Selbst eingetragen.'}
        </CardMeta>
        <dl className="mt-3 divide-y divide-line-soft">
          {rows.map(([label, value], index) => (
            <div
              key={label}
              className="rise-in flex justify-between py-1.5 text-sm"
              style={{ '--i': index } as React.CSSProperties}
            >
              <dt className="text-muted">{label}</dt>
              <dd className="num text-fg">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {portions.length > 0 ? (
        <Card>
          <CardTitle>Portionen</CardTitle>
          <ul className="mt-2 space-y-1 text-sm">
            {portions.map((portion) => (
              <li key={portion.id} className="flex justify-between">
                <span className="text-fg">{portion.labelDe}</span>
                <span className="text-muted">
                  <span className="num">{Math.round(portion.grams)} g</span>
                  {portion.isDefault ? ' (Standard)' : ''}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardTitle>Enthält</CardTitle>
        <CardMeta className="mt-1">
          Änderungen gelten auch rückwirkend für bereits erfasste Mahlzeiten –
          genau dafür ist die Kennzeichnung da.
        </CardMeta>
        <div className="mt-3">
          <TagEditor
            foodId={food.id}
            allTags={tags.map((tag) => ({
              id: tag.id,
              labelDe: tag.labelDe,
              category: tag.category,
            }))}
            selected={detail.tags.map((tag) => tag.id)}
          />
        </div>
      </Card>
    </main>
  );
}
