import { notFound } from 'next/navigation';
import { requireUser } from '@/auth.helpers';
import {
  allTagDefs,
  distinctPortionLabels,
  getFoodDetail,
} from '@/db/queries/foods';
import { Card, CardMeta, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { NutrientEditor } from '@/components/food-picker/nutrient-editor';
import { PortionEditor } from '@/components/food-picker/portion-editor';
import { TagEditor } from '@/components/food-picker/tag-editor';
import { portionLabelSuggestions } from '@/lib/food-units';
import { formatGermanNumber, formatGrams, formatKcal } from '@/lib/nutrition';

export const metadata = { title: 'Lebensmittel – Wellbeing' };

export default async function FoodDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const [detail, tags, usedLabels] = await Promise.all([
    getFoodDetail(id),
    allTagDefs(),
    distinctPortionLabels(),
  ]);
  if (!detail) notFound();
  const { food, portions } = detail;

  // 'ml' or 'g'. `basisUnit` is a portion-unit enum, so it can in principle
  // hold 'piece' or 'portion'; nutrients are per 100 of a mass or a volume and
  // nothing else, so anything but 'ml' reads as grams.
  const basisUnit = food.basisUnit === 'ml' ? 'ml' : 'g';

  const rows: [string, string][] = [
    ['Kalorien', formatKcal(food.kcal100)],
    ['Eiweiß', formatGrams(food.protein100)],
    ['Fett', formatGrams(food.fat100)],
    ['davon gesättigte Fettsäuren', formatGrams(food.satFat100)],
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
        <CardTitle>Nährwerte je 100 {basisUnit}</CardTitle>
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

        <div className="mt-3 border-t border-line-soft pt-2">
          <NutrientEditor
            foodId={food.id}
            food={food}
            basisUnit={basisUnit}
            portionGrams={food.defaultPortionGrams}
          />
          <p className="mt-1 px-1 text-xs text-muted">
            Eine Korrektur gilt ab jetzt. Bereits erfasste Mahlzeiten behalten
            die Werte, die zum Zeitpunkt des Eintrags galten – anders als bei der
            Kennzeichnung weiter unten, die auch rückwirkend gilt.
          </p>
        </div>
      </Card>

      {/* One card, one place to maintain a measure. `defaultPortionGrams` keeps
          a line of its own only while there is no `food_portion` row: from the
          first one on it mirrors the default row (`syncDefaultPortion`), and
          printing both would be the same number twice under two names. */}
      <Card>
        <CardTitle>Einheiten</CardTitle>
        <CardMeta className="mt-1">
          Was eine Portion, ein Stück oder eine Scheibe wiegt. Beim Erfassen
          lässt sich damit die Menge in dieser Einheit angeben statt in{' '}
          {basisUnit}.
        </CardMeta>
        <div className="mt-3">
          <PortionEditor
            foodId={food.id}
            portions={portions.map((portion) => ({
              id: portion.id,
              labelDe: portion.labelDe,
              grams: portion.grams,
              isDefault: portion.isDefault,
            }))}
            suggestions={portionLabelSuggestions(usedLabels)}
            kcal100={food.kcal100}
            basisUnit={basisUnit}
          />
        </div>
        {portions.length === 0 && food.defaultPortionGrams !== null ? (
          <p className="mt-3 border-t border-line-soft pt-2 text-sm text-muted">
            Übliche Portion:{' '}
            <span className="num text-fg">
              {formatGermanNumber(food.defaultPortionGrams, 1)} {basisUnit}
            </span>{' '}
            – ohne Namen, aus dem Anlege-Formular. Die erste Einheit hier ersetzt
            sie.
          </p>
        ) : null}
      </Card>

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
