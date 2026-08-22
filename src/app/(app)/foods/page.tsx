import Link from 'next/link';
import { Plus, ScanLine } from 'lucide-react';
import { requireUser } from '@/auth.helpers';
import { recentFoods, searchFoods } from '@/db/queries/foods';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
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
      <header className="flex items-center justify-between gap-2 pt-2">
        <h1 className="text-xl font-semibold text-fg">Lebensmittel</h1>
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
      </header>

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
        <Card>
          <p className="text-sm text-muted">
            {query
              ? 'Nichts gefunden.'
              : 'Noch keine Lebensmittel. Scanne einen Barcode oder lege eins an.'}
          </p>
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {foods.map((food) => (
              <li key={food.id}>
                <Link
                  href={`/foods/${food.id}`}
                  className="flex min-h-14 items-center justify-between gap-3 px-4 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-base text-fg">
                      {food.name}
                    </span>
                    <span className="block text-xs text-muted">
                      {food.brand ? `${food.brand} · ` : ''}
                      {formatKcal(food.kcal100)} / 100 g
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">
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
