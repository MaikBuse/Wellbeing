'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  createFoodFromCatalog,
  searchCatalogAction,
  searchFoodsAction,
} from '@/actions/foods';
import { isSearchable } from '@/lib/search/terms';
import { quickAddFood } from '@/actions/meals';
import { Chip, ChipRow } from '@/components/ui/chip';
import { Input } from '@/components/ui/field';
import type { CatalogListItem, FoodListItem } from '@/db/queries/foods';
import type { MealSlotKey } from '@/lib/scales';
import { SectionLabel } from '@/components/ui/section-label';

/**
 * The three-tap path: tap the slot, tap a chip, done.
 *
 * "Häufig" is ranked by usage within this slot, so after two weeks her actual
 * breakfast is the first three chips and no search is needed at all.
 *
 * The BLS catalog is a fallback and stays one: it is only queried once the
 * library has come back thin, so the common path never waits on it.
 */
/** Below this the library counts as "nothing useful", and the BLS is asked. */
const THIN = 5;

export function FoodPicker({
  slot,
  logDate,
  frequent,
  recent,
  showEmptyHint = false,
  onAdded,
}: {
  slot: MealSlotKey;
  logDate: string;
  frequent: FoodListItem[];
  recent: FoodListItem[];
  /** Long "how to get started" copy — shown once per screen, not per slot. */
  showEmptyHint?: boolean;
  onAdded?: () => void;
}) {
  const [query, setQuery] = useState('');
  // Keyed by the term it belongs to, so a stale result set is simply not shown
  // rather than having to be cleared from an effect.
  const [results, setResults] = useState<{
    term: string;
    rows: FoodListItem[];
  } | null>(null);
  // Only fetched when the library is thin for this term, and keyed the same way.
  const [catalog, setCatalog] = useState<{
    term: string;
    rows: CatalogListItem[];
  } | null>(null);
  const [searching, setSearching] = useState(false);
  const [pending, startTransition] = useTransition();
  const [addingId, setAddingId] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (!isSearchable(term)) return;
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      setSearching(true);
      searchFoodsAction(term)
        .then(async (rows) => {
          // Ignore out-of-order responses from earlier keystrokes.
          if (id !== requestId.current) return;
          setResults({ term, rows });
          if (rows.length >= THIN) {
            setCatalog(null);
            return;
          }
          const found = await searchCatalogAction(term).catch(
            (): CatalogListItem[] => []
          );
          if (id === requestId.current) setCatalog({ term, rows: found });
        })
        .catch(() => {
          if (id === requestId.current) setResults({ term, rows: [] });
        })
        .finally(() => {
          if (id === requestId.current) setSearching(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  function added(name: string) {
    toast.success(`${name} hinzugefügt`);
    setQuery('');
    setResults(null);
    setCatalog(null);
    onAdded?.();
  }

  function add(food: FoodListItem) {
    setAddingId(food.id);
    startTransition(async () => {
      const result = await quickAddFood({ slot, logDate, foodId: food.id });
      setAddingId(null);
      if (result.ok) added(food.name);
      else toast.error(result.error);
    });
  }

  /**
   * Copy the catalog entry into the library, then log it — one tap for what
   * used to be a trip to the "Neu anlegen" form.
   */
  function addFromCatalog(entry: CatalogListItem) {
    setAddingId(entry.id);
    startTransition(async () => {
      const created = await createFoodFromCatalog(entry.id);
      if (!created.ok) {
        setAddingId(null);
        toast.error(created.error);
        return;
      }
      const result = await quickAddFood({
        slot,
        logDate,
        foodId: created.foodId,
      });
      setAddingId(null);
      if (result.ok) added(entry.nameDe);
      else toast.error(result.error);
    });
  }

  const term = query.trim();
  // Derived, not synced: results only count while they match what is typed.
  const matching =
    isSearchable(term) && results?.term === term ? results.rows : null;
  const catalogHits =
    isSearchable(term) && catalog?.term === term ? catalog.rows : [];
  const suggestions = frequent.length > 0 ? frequent : recent;
  const shown = matching ?? suggestions;
  const heading =
    matching !== null
      ? 'Treffer'
      : frequent.length > 0
        ? 'Häufig'
        : 'Zuletzt benutzt';

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        />
        <Input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Lebensmittel suchen"
          className="pl-9"
          aria-label="Lebensmittel suchen"
        />
        {searching ? (
          <Loader2
            aria-hidden
            className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted"
          />
        ) : null}
      </div>

      {shown.length > 0 ? (
        <div className="space-y-2">
          <SectionLabel>{heading}</SectionLabel>
          <ChipRow>
            {shown.map((food) => (
              <Chip
                key={food.id}
                // The whole row goes inert, not just the tapped chip: two taps
                // in the same moment used to fire two writes at an empty slot
                // and create two meals, which showed up as two separate times.
                // The server also takes an advisory lock, but there is no reason
                // to let the UI produce the race in the first place.
                disabled={pending}
                onClick={() => add(food)}
              >
                {pending && addingId === food.id ? (
                  <Loader2 aria-hidden className="size-3.5 animate-spin" />
                ) : (
                  <Plus aria-hidden className="size-3.5" />
                )}
                {food.name}
                {food.brand ? (
                  <span className="text-muted">· {food.brand}</span>
                ) : null}
              </Chip>
            ))}
          </ChipRow>
        </div>
      ) : null}

      {catalogHits.length > 0 ? (
        <div className="space-y-2">
          <SectionLabel>Aus dem Nährstoffkatalog</SectionLabel>
          <ChipRow>
            {catalogHits.map((entry) => (
              <Chip
                key={entry.id}
                disabled={pending && addingId === entry.id}
                onClick={() => addFromCatalog(entry)}
              >
                {pending && addingId === entry.id ? (
                  <Loader2 aria-hidden className="size-3.5 animate-spin" />
                ) : (
                  <Plus aria-hidden className="size-3.5" />
                )}
                {entry.nameDe}
              </Chip>
            ))}
          </ChipRow>
        </div>
      ) : null}

      {shown.length === 0 && catalogHits.length === 0 ? (
        matching !== null ? (
          <p className="text-sm text-muted">
            Nichts gefunden. Lege das Lebensmittel unter „Essen“ neu an oder
            scanne den Barcode.
          </p>
        ) : showEmptyHint ? (
          <p className="text-sm text-muted">
            Noch keine Lebensmittel. Scanne einen Barcode oder lege eins unter
            „Essen“ an.
          </p>
        ) : null
      ) : null}
    </div>
  );
}
