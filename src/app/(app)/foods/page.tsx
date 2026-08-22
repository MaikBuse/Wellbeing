import Link from 'next/link';
import { Plus, ScanLine } from 'lucide-react';
import { requireUser } from '@/auth.helpers';
import { recentFoods, searchFoods } from '@/db/queries/foods';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { formatKcal } from '@/lib/nutrition';

export const metadata = { title: 'Essen – Wellbeing' };

export default async function FoodsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const { q } = await searchParams;
  const query = q?.trim() ?? '';
  const foods =
    query.length >= 2
      ? await searchFoods(user.id, query, 50)
      : await recentFoods(user.id, 50);

  return (
    <main className="space-y-4 p-4">
      <PageHeader
        title="Lebensmittel"
        action={
          <div className="flex gap-2">
            <Button asChild variant="soft" size="sm">
              <Link href="/scan">
                <ScanLine aria-hidden className="size-4" />
                Scannen
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/foods/new">
                <Plus aria-hidden className="size-4" />
                Neu
              </Link>
            </Button>
          </div>
        }
      />

      <form action="/foods">
        <Input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Suchen"
          aria-label="Lebensmittel suchen"
        />
      </form>

      {foods.length === 0 ? (
        <EmptyState
          icon={<ScanLine aria-hidden className="size-7" />}
          title={query ? 'Nichts gefunden' : 'Noch keine Lebensmittel'}
          description={
            query
              ? 'Vielleicht anders geschrieben – oder als neues Lebensmittel anlegen.'
              : 'Scanne einen Barcode oder lege das erste Lebensmittel selbst an.'
          }
          action={
            <Button asChild variant="outline" size="sm">
              <Link href={query ? '/foods/new' : '/scan'}>
                {query ? 'Neu anlegen' : 'Barcode scannen'}
              </Link>
            </Button>
          }
        />
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-line-soft">
            {foods.map((food, index) => (
              <li
                key={food.id}
                className="rise-in"
                style={{ '--i': Math.min(index, 12) } as React.CSSProperties}
              >
                <Link
                  href={`/foods/${food.id}`}
                  className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 transition-colors duration-120 first:rounded-t-card last:rounded-b-card hover:bg-primary-tint"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-base text-fg">
                      {food.name}
                    </span>
                    <span className="block text-xs text-muted">
                      {food.brand ? `${food.brand} · ` : ''}
                      <span className="num">
                        {formatKcal(food.kcal100)} / 100 g
                      </span>
                    </span>
                  </span>
                  <span className="num shrink-0 text-xs text-muted">
                    {food.useCount}×
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}
