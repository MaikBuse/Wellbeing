import { describe, expect, it } from 'vitest';
import { deriveTags, tagInputFromName, type TagRule } from '../tagRules';

const glutenAllergen: TagRule = {
  tagId: 'gluten',
  matchType: 'off_allergen',
  pattern: 'en:gluten',
  confidence: 'certain',
  isNegative: false,
};
const glutenKeyword: TagRule = {
  tagId: 'gluten',
  matchType: 'ingredient_keyword',
  pattern: 'weizen|dinkel',
  confidence: 'likely',
  isNegative: false,
};
const glutenFree: TagRule = {
  tagId: 'gluten',
  matchType: 'name_keyword',
  pattern: 'glutenfrei',
  confidence: 'certain',
  isNegative: true,
};
const soyTrace: TagRule = {
  tagId: 'soy',
  matchType: 'off_trace',
  pattern: 'en:soybeans',
  confidence: 'trace',
  isNegative: false,
};
const novaFour: TagRule = {
  tagId: 'ultra_processed',
  matchType: 'off_category',
  pattern: 'nova:4',
  confidence: 'likely',
  isNegative: false,
};

const base = {
  brand: null,
  categoriesTags: [] as string[],
  allergensTags: [] as string[],
  tracesTags: [] as string[],
  additivesTags: [] as string[],
  ingredientsText: null as string | null,
  novaGroup: null as number | null,
};

describe('deriveTags', () => {
  it('takes the highest confidence when several rules hit the same tag', () => {
    const tags = deriveTags(
      {
        ...base,
        name: 'Weizenbrot',
        allergensTags: ['en:gluten'],
        ingredientsText: 'Weizenmehl, Wasser, Salz',
      },
      [glutenKeyword, glutenAllergen]
    );
    expect(tags).toEqual([
      { tagId: 'gluten', confidence: 'certain', source: 'off_derived' },
    ]);
  });

  it('lets a negative rule win over any positive match', () => {
    // Without the negative rule, every "glutenfreies Brot" would be tagged
    // gluten by keyword — this is the single most important rule behaviour.
    const tags = deriveTags(
      {
        ...base,
        name: 'Glutenfreies Brot',
        ingredientsText: 'Reismehl, Wasser, kein Weizen',
      },
      [glutenKeyword, glutenFree]
    );
    expect(tags).toEqual([]);
  });

  it('marks trace allergens as trace so the analysis can exclude them', () => {
    const tags = deriveTags(
      { ...base, name: 'Schokolade', tracesTags: ['en:soybeans'] },
      [soyTrace]
    );
    expect(tags[0]).toMatchObject({ tagId: 'soy', confidence: 'trace' });
  });

  it('exposes the NOVA processing level as a category pseudo-tag', () => {
    const tags = deriveTags({ ...base, name: 'Fertigpizza', novaGroup: 4 }, [
      novaFour,
    ]);
    expect(tags.map((t) => t.tagId)).toEqual(['ultra_processed']);
  });

  it('falls back to the name for manually created foods with no ingredients', () => {
    const tags = deriveTags(tagInputFromName('Dinkelbrötchen'), [
      glutenKeyword,
    ]);
    expect(tags.map((t) => t.tagId)).toEqual(['gluten']);
  });

  it('returns nothing when no rule matches', () => {
    expect(deriveTags(tagInputFromName('Apfel'), [glutenKeyword])).toEqual([]);
  });
});
