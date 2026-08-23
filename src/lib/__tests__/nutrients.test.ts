import { describe, expect, it } from 'vitest';
import { foodCatalog, mealItems } from '@/db/schema';
import {
  CATALOG_UNIT_FACTOR,
  NUTRIENT_KEYS,
  NUTRIENT_META,
  UNIT_LABEL,
  type NutrientKey,
} from '../nutrients';

/**
 * The structural guard.
 *
 * Five subsystems read `NUTRIENT_META` — the catalog columns, the target
 * catalog, the supplement mapping, the aggregation and the UI. A declared
 * column that does not exist on the table would only surface as an undefined at
 * query time, on the one nutrient nobody happened to log that week. This test
 * is what makes that a compile-time-ish failure instead.
 */
describe('NUTRIENT_META', () => {
  it('declares every key exactly once', () => {
    expect(new Set(NUTRIENT_KEYS).size).toBe(NUTRIENT_KEYS.length);
  });

  it('has an entry for every key, keyed by itself', () => {
    for (const key of NUTRIENT_KEYS) {
      expect(NUTRIENT_META[key]).toBeDefined();
      expect(NUTRIENT_META[key].key).toBe(key);
    }
  });

  it('names every nutrient in German and gives it a unit label', () => {
    for (const key of NUTRIENT_KEYS) {
      const meta = NUTRIENT_META[key];
      expect(meta.labelDe.length).toBeGreaterThan(1);
      expect(UNIT_LABEL[meta.unit]).toBeDefined();
      expect(meta.decimals).toBeGreaterThanOrEqual(0);
      expect(meta.decimals).toBeLessThanOrEqual(3);
    }
  });

  it('points every catalog source at a real food_catalog column', () => {
    const columns = new Set(Object.keys(foodCatalog));
    for (const key of NUTRIENT_KEYS) {
      const source = NUTRIENT_META[key].source;
      if (source.kind !== 'catalog') continue;
      expect(columns, `${key} -> ${source.column}`).toContain(source.column);
    }
  });

  it('points every snapshot source at a real meal_item column', () => {
    const columns = new Set(Object.keys(mealItems));
    for (const key of NUTRIENT_KEYS) {
      const source = NUTRIENT_META[key].source;
      if (source.kind !== 'snapshot') continue;
      expect(columns, `${key} -> ${source.column}`).toContain(source.column);
    }
  });

  it('never points two nutrients at the same column', () => {
    const seen = new Map<string, NutrientKey>();
    for (const key of NUTRIENT_KEYS) {
      const source = NUTRIENT_META[key].source;
      if (source.kind === 'derived') continue;
      const slot = `${source.kind}:${source.column}`;
      expect(seen.get(slot), `${key} collides with ${seen.get(slot)}`).toBe(
        undefined
      );
      seen.set(slot, key);
    }
  });

  /*
   * Units stay BLS-native. A second factor would mean someone normalised a unit
   * for cosmetics, and then `select vit_d_100` stops matching what the app
   * shows. Arachidonic acid is the one deliberate exception: a 50 mg limit
   * printed as "0,05 g" reads as noise.
   */
  it('converts exactly one catalog unit, and only arachidonic acid', () => {
    expect(Object.keys(CATALOG_UNIT_FACTOR)).toEqual(['arachidonic']);
    expect(CATALOG_UNIT_FACTOR.arachidonic).toBe(1000);
  });

  it('offers no selenium target, because the BLS carries no selenium', () => {
    const keys = NUTRIENT_KEYS.map((key) => key.toLowerCase());
    expect(keys).not.toContain('selenium');
    expect(keys).not.toContain('selen');
  });
});
