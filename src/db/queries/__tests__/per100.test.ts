import { describe, expect, it } from 'vitest';
import { foodCatalog, foods } from '@/db/schema';
import { NUTRIENT_KEYS, NUTRIENT_META } from '@/lib/nutrients';
import { per100ColumnFor } from '../nutrition';

/**
 * The same structural guard `nutrients.test.ts` puts on `NUTRIENT_META`, for
 * the second column map.
 *
 * `per100ColumnFor` exists because `columnFor` resolves the eight snapshot
 * nutrients to `meal_item` — an absolute amount for one portion, useless for
 * ranking density. The per-100 twin lives on `food`, and a typo in that map
 * would surface as an undefined column on whichever nutrient happened to be the
 * day's weakest. Not a failure anyone would notice quickly.
 */
describe('per100ColumnFor', () => {
  const foodNames = new Set(Object.keys(foods));
  const catalogNames = new Set(Object.keys(foodCatalog));

  it('resolves a real column for every nutrient that has one', () => {
    const resolved: string[] = [];
    for (const key of NUTRIENT_KEYS) {
      const source = NUTRIENT_META[key].source;
      if (source.kind === 'derived') {
        expect(() => per100ColumnFor(key)).toThrow();
        continue;
      }
      const column = per100ColumnFor(key);
      expect(column, key).toBeDefined();
      expect(column.name, key).toBeTruthy();
      resolved.push(key);
    }
    expect(resolved.length).toBe(NUTRIENT_KEYS.length - 1);
  });

  it('puts the snapshot nutrients on food, not on meal_item', () => {
    for (const key of NUTRIENT_KEYS) {
      if (NUTRIENT_META[key].source.kind !== 'snapshot') continue;
      const column = per100ColumnFor(key);
      // The per-100 twin is a food column and its name says so.
      expect(foodNames.size).toBeGreaterThan(0);
      expect(column.name, key).toMatch(/_100$/);
    }
  });

  it('leaves the catalog nutrients where they already are', () => {
    for (const key of NUTRIENT_KEYS) {
      const source = NUTRIENT_META[key].source;
      if (source.kind !== 'catalog') continue;
      expect(catalogNames, key).toContain(source.column);
      expect(per100ColumnFor(key).name).toBe(
        (foodCatalog as unknown as Record<string, { name: string }>)[
          source.column
        ].name
      );
    }
  });

  it('never resolves two nutrients to the same column', () => {
    const seen = new Map<string, string>();
    for (const key of NUTRIENT_KEYS) {
      if (NUTRIENT_META[key].source.kind === 'derived') continue;
      const column = per100ColumnFor(key);
      const id = `${column.table}.${column.name}`;
      expect(seen.get(id), `${key} collides with ${seen.get(id)}`).toBeUndefined();
      seen.set(id, key);
    }
  });
});
