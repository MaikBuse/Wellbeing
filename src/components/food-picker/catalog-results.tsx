'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { createFoodFromCatalog } from '@/actions/foods';
import { Card } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import type { CatalogListItem } from '@/db/queries/foods';
import { formatKcal } from '@/lib/nutrition';

/**
 * BLS catalog hits on the food library screen, for when the library itself has
 * nothing. Tapping one copies it into the library and opens it, so the tags and
 * the portion can be checked right away — the entry arrives tagged from the
 * rules, but only the person eating it knows whether that is right.
 */
export function CatalogResults({ entries }: { entries: CatalogListItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addingId, setAddingId] = useState<string | null>(null);

  if (entries.length === 0) return null;

  function open(entry: CatalogListItem) {
    setAddingId(entry.id);
    startTransition(async () => {
      const result = await createFoodFromCatalog(entry.id);
      setAddingId(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.push(`/foods/${result.foodId}`);
    });
  }

  return (
    <div className="space-y-2">
      <SectionLabel>Aus dem Nährstoffkatalog</SectionLabel>
      <Card padded={false}>
        <ul className="divide-y divide-line-soft">
          {entries.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                disabled={pending && addingId === entry.id}
                onClick={() => open(entry)}
                className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors duration-120 first:rounded-t-card last:rounded-b-card hover:bg-primary-tint disabled:opacity-60"
              >
                <span className="min-w-0">
                  <span className="block truncate text-base text-fg">
                    {entry.nameDe}
                  </span>
                  <span className="num block text-xs text-muted">
                    {formatKcal(entry.kcal100)} / 100 g
                  </span>
                </span>
                {pending && addingId === entry.id ? (
                  <Loader2
                    aria-hidden
                    className="size-4 shrink-0 animate-spin text-muted"
                  />
                ) : (
                  <Plus aria-hidden className="size-4 shrink-0 text-muted" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
