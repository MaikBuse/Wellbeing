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

// --- BLS catalog rules -----------------------------------------------------

const lactoseMeasured: TagRule = {
  tagId: 'lactose',
  matchType: 'bls_measured',
  pattern: 'lactose>0.5',
  confidence: 'certain',
  isNegative: false,
};
const lactoseFromCheeseName: TagRule = {
  tagId: 'lactose',
  matchType: 'name_keyword',
  pattern: 'käse|milch',
  confidence: 'likely',
  isNegative: false,
};
const lactoseFree: TagRule = {
  tagId: 'lactose',
  matchType: 'name_keyword',
  pattern: 'laktosefrei',
  confidence: 'certain',
  isNegative: true,
};
const fructoseExcess: TagRule = {
  tagId: 'fructose',
  matchType: 'bls_measured',
  pattern: 'fructose_excess>0.5',
  confidence: 'certain',
  isNegative: false,
};
const polyol: TagRule = {
  tagId: 'sorbitol',
  matchType: 'bls_measured',
  pattern: 'polyol>0.5',
  confidence: 'certain',
  isNegative: false,
};
const eggGroup: TagRule = {
  tagId: 'egg',
  matchType: 'bls_group',
  pattern: '^E1',
  confidence: 'certain',
  isNegative: false,
};

/** Only the fields a given test cares about; the rest stay unmeasured. */
function catalogInput(
  blsCode: string,
  nameDe: string,
  measured: Record<string, number | null> = {}
) {
  return { ...tagInputFromName(nameDe), blsCode, measured };
}

describe('bls_measured', () => {
  it('tags milk from the measured value', () => {
    const tags = deriveTags(
      catalogInput('M111300', 'Vollmilch frisch, 3,5 % Fett', {
        lactose: 3.89,
      }),
      [lactoseMeasured]
    );
    expect(tags.map((t) => t.tagId)).toEqual(['lactose']);
  });

  it('leaves lactose-free milk alone: 0.05 g is under the threshold', () => {
    // The name rule would not save us here — this is why the threshold is 0.5
    // and not "greater than zero".
    const tags = deriveTags(
      catalogInput('M114300', 'Vollmilch 3,5 % Fett, laktosefrei', {
        lactose: 0.05,
      }),
      [lactoseMeasured]
    );
    expect(tags).toEqual([]);
  });

  it('does not tag hard cheese, which a name rule gets wrong', () => {
    const input = catalogInput('M400700', 'Schnittkäse mind. 50 % Fett i. Tr.', {
      lactose: 0,
    });
    expect(deriveTags(input, [lactoseMeasured])).toEqual([]);
    // The keyword rule is the thing being improved on: it fires wrongly.
    expect(deriveTags(input, [lactoseFromCheeseName]).map((t) => t.tagId)).toEqual(
      ['lactose']
    );
  });

  it('treats an unmeasured nutrient as deciding nothing', () => {
    expect(
      deriveTags(catalogInput('X000000', 'Irgendein Gericht', { lactose: null }), [
        lactoseMeasured,
      ])
    ).toEqual([]);
    // Absent from the object entirely, not just null.
    expect(
      deriveTags(catalogInput('X000000', 'Irgendein Gericht'), [lactoseMeasured])
    ).toEqual([]);
  });

  it('a negative name rule still beats a measured rule', () => {
    const tags = deriveTags(
      catalogInput('M114300', 'Vollmilch 3,5 % Fett, laktosefrei', {
        lactose: 3.89, // deliberately wrong data
      }),
      [lactoseMeasured, lactoseFree]
    );
    expect(tags).toEqual([]);
  });

  it('scores fructose against glucose, not on its own', () => {
    // Apple: 3.3 g fructose against 1.4 g glucose — malabsorption territory.
    expect(
      deriveTags(catalogInput('F110100', 'Apfel roh', {
        fructose: 3.3,
        glucose: 1.4,
      }), [fructoseExcess]).map((t) => t.tagId)
    ).toEqual(['fructose']);

    // Same fructose, glucose to carry it: not an excess.
    expect(
      deriveTags(catalogInput('F999999', 'Etwas Ausgewogenes', {
        fructose: 3.3,
        glucose: 3.3,
      }), [fructoseExcess])
    ).toEqual([]);
  });

  it('sums sorbitol and mannitol — one FODMAP axis, not two', () => {
    // 0.4 each: neither clears 0.5 alone, together they do.
    expect(
      deriveTags(
        catalogInput('F000000', 'Etwas Steinobstiges', {
          sorbitol: 0.4,
          mannitol: 0.4,
        }),
        [polyol]
      ).map((t) => t.tagId)
    ).toEqual(['sorbitol']);
  });

  it('ignores a malformed pattern rather than matching everything', () => {
    const broken: TagRule = { ...lactoseMeasured, pattern: 'lactose' };
    expect(
      deriveTags(catalogInput('M111300', 'Vollmilch', { lactose: 3.89 }), [
        broken,
      ])
    ).toEqual([]);
  });
});

describe('bls_group', () => {
  it('matches the code prefix, not the leading letter alone', () => {
    // Group E holds both eggs (E1…) and pasta (E4…).
    expect(
      deriveTags(catalogInput('E111100', 'Hühnerei roh'), [eggGroup]).map(
        (t) => t.tagId
      )
    ).toEqual(['egg']);
    expect(
      deriveTags(catalogInput('E401000', 'Teigwaren eifrei, roh'), [eggGroup])
    ).toEqual([]);
  });

  it('never fires for a food without a BLS code', () => {
    expect(deriveTags(tagInputFromName('Hühnerei roh'), [eggGroup])).toEqual([]);
  });
});
