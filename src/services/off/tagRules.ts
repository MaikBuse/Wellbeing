/**
 * Local tag derivation.
 *
 * This is the load-bearing part of the analytics: Open Food Facts knows
 * allergens, ingredients, categories and additives, and nothing about
 * histamine, FODMAP, nightshades or salicylates. Every one of those tags comes
 * from the rules here.
 *
 * Precedence: manual > rule/off_derived. A negative rule wins over any
 * positive rule for the same tag, so "glutenfreies Brot" does not get tagged
 * gluten by keyword.
 */
import type { OffProductData } from '@/lib/off';

export type TagRule = {
  tagId: string;
  matchType:
    | 'off_allergen'
    | 'off_trace'
    | 'off_category'
    | 'off_additive'
    | 'ingredient_keyword'
    | 'name_keyword'
    | 'bls_group'
    | 'bls_measured';
  pattern: string;
  confidence: 'certain' | 'likely' | 'trace';
  isNegative: boolean;
};

export type DerivedTag = {
  tagId: string;
  confidence: 'certain' | 'likely' | 'trace';
  source: 'off_derived' | 'rule';
};

const CONFIDENCE_RANK = { trace: 0, likely: 1, certain: 2 } as const;

function matchesList(pattern: string, values: string[]): boolean {
  if (values.length === 0) return false;
  const re = new RegExp(pattern, 'i');
  return values.some((value) => re.test(value));
}

function matchesText(pattern: string, text: string | null): boolean {
  if (!text) return false;
  return new RegExp(pattern, 'i').test(text);
}

/**
 * `novaGroup` is exposed to category rules as the pseudo-tag `nova:<n>` so a
 * processing level can be expressed the same way as any other category.
 */
function categoryValues(product: TagInput): string[] {
  const values = [...product.categoriesTags];
  if (product.novaGroup !== null && product.novaGroup !== undefined) {
    values.push(`nova:${product.novaGroup}`);
  }
  return values;
}

/**
 * Measured grams per 100 g from the BLS catalog.
 *
 * `null` means the nutrient was not measured and must never satisfy a
 * threshold in either direction; `0` means measured and none detectable (the
 * BLS `<LOD` sentinel included) and legitimately withholds a tag.
 */
export type MeasuredNutrients = {
  lactose: number | null;
  fructose: number | null;
  glucose: number | null;
  sorbitol: number | null;
  mannitol: number | null;
  alcohol: number | null;
  sugar: number | null;
  omega3: number | null;
  epaDha: number | null;
  arachidonic: number | null;
};

export type TagInput = {
  name: string;
  brand?: string | null;
  categoriesTags: string[];
  allergensTags: string[];
  tracesTags: string[];
  additivesTags: string[];
  ingredientsText: string | null;
  novaGroup: number | null;
  /** BLS code, for `bls_group` rules. Only catalog-derived foods have one. */
  blsCode?: string | null;
  /** Measured values, for `bls_measured` rules. Empty for OFF and manual. */
  measured?: Partial<MeasuredNutrients>;
};

export function tagInputFromOff(product: OffProductData): TagInput {
  return {
    name: product.productName ?? '',
    brand: product.brands,
    categoriesTags: product.categoriesTags,
    allergensTags: product.allergensTags,
    tracesTags: product.tracesTags,
    additivesTags: product.additivesTags,
    ingredientsText: product.ingredientsText,
    novaGroup: product.novaGroup,
  };
}

/** A manually created food has only a name to go on. */
export function tagInputFromName(name: string): TagInput {
  return {
    name,
    brand: null,
    categoriesTags: [],
    allergensTags: [],
    tracesTags: [],
    additivesTags: [],
    ingredientsText: null,
    novaGroup: null,
  };
}

/**
 * A BLS catalog row. The name still runs through the keyword rules — the
 * measured columns cover lactose, fructose, polyols and alcohol, but gluten,
 * histamine, nightshade and the rest are not in the BLS and are still read off
 * the name.
 */
export type CatalogTagSource = {
  blsCode: string;
  nameDe: string;
  lactose100: number | null;
  fructose100: number | null;
  glucose100: number | null;
  sorbitol100: number | null;
  mannitol100: number | null;
  alcohol100: number | null;
  sugar100: number | null;
  omega3100: number | null;
  epaDha100: number | null;
  arachidonic100: number | null;
};

export function tagInputFromCatalog(row: CatalogTagSource): TagInput {
  return {
    name: row.nameDe,
    brand: null,
    categoriesTags: [],
    allergensTags: [],
    tracesTags: [],
    additivesTags: [],
    ingredientsText: null,
    novaGroup: null,
    blsCode: row.blsCode,
    measured: {
      lactose: row.lactose100,
      fructose: row.fructose100,
      glucose: row.glucose100,
      sorbitol: row.sorbitol100,
      mannitol: row.mannitol100,
      alcohol: row.alcohol100,
      sugar: row.sugar100,
      omega3: row.omega3100,
      epaDha: row.epaDha100,
      arachidonic: row.arachidonic100,
    },
  };
}

/**
 * Derived measures, because the naive reading of the raw column would be
 * clinically wrong.
 *
 * `fructose_excess` is fructose beyond glucose, which is what fructose
 * malabsorption responds to — plain fructose would flag every apple-and-grape
 * food equally regardless of whether the glucose is there to carry it.
 *
 * `polyol` merges sorbitol and mannitol: they are one FODMAP axis, and a food
 * carrying 0.4 g of each is not below a 0.5 g threshold.
 */
function measuredValue(
  field: string,
  measured: Partial<MeasuredNutrients>
): number | null {
  if (field === 'fructose_excess') {
    const { fructose, glucose } = measured;
    if (fructose === null || fructose === undefined) return null;
    return fructose - (glucose ?? 0);
  }
  if (field === 'polyol') {
    const { sorbitol, mannitol } = measured;
    if (sorbitol === null || sorbitol === undefined) {
      return mannitol ?? null;
    }
    return sorbitol + (mannitol ?? 0);
  }
  const value = measured[field as keyof MeasuredNutrients];
  return value ?? null;
}

/** 'lactose>0.5' / 'sugar>=22.5'. Anything else is a seed bug, not a match. */
function matchesMeasured(pattern: string, input: TagInput): boolean {
  const parsed = /^\s*([A-Za-z_]+)\s*(>=|>|<=|<)\s*(-?[\d.]+)\s*$/.exec(pattern);
  if (!parsed) return false;
  const [, field, operator, threshold] = parsed;

  const value = measuredValue(field, input.measured ?? {});
  // Not measured decides nothing — neither for nor against the tag.
  if (value === null) return false;

  const limit = Number(threshold);
  if (!Number.isFinite(limit)) return false;
  switch (operator) {
    case '>':
      return value > limit;
    case '>=':
      return value >= limit;
    case '<':
      return value < limit;
    case '<=':
      return value <= limit;
    default:
      return false;
  }
}

function ruleMatches(rule: TagRule, input: TagInput): boolean {
  switch (rule.matchType) {
    case 'off_allergen':
      return matchesList(rule.pattern, input.allergensTags);
    case 'off_trace':
      return matchesList(rule.pattern, input.tracesTags);
    case 'off_category':
      return matchesList(rule.pattern, categoryValues(input));
    case 'off_additive':
      return matchesList(rule.pattern, input.additivesTags);
    case 'ingredient_keyword':
      // Fall back to the name: a manually created food has no ingredient list,
      // and "Vollkornbrot" should still be matchable.
      return (
        matchesText(rule.pattern, input.ingredientsText) ||
        matchesText(rule.pattern, input.name)
      );
    case 'name_keyword':
      return matchesText(
        rule.pattern,
        [input.name, input.brand ?? ''].join(' ')
      );
    case 'bls_group':
      return input.blsCode
        ? new RegExp(rule.pattern, 'i').test(input.blsCode)
        : false;
    case 'bls_measured':
      return matchesMeasured(rule.pattern, input);
  }
}

export function deriveTags(input: TagInput, rules: TagRule[]): DerivedTag[] {
  const excluded = new Set<string>();
  const best = new Map<string, DerivedTag>();

  for (const rule of rules) {
    if (!ruleMatches(rule, input)) continue;
    if (rule.isNegative) {
      excluded.add(rule.tagId);
      continue;
    }
    const existing = best.get(rule.tagId);
    const source = rule.matchType.startsWith('off_')
      ? 'off_derived'
      : ('rule' as const);
    if (
      !existing ||
      CONFIDENCE_RANK[rule.confidence] > CONFIDENCE_RANK[existing.confidence]
    ) {
      best.set(rule.tagId, {
        tagId: rule.tagId,
        confidence: rule.confidence,
        source: source as 'off_derived' | 'rule',
      });
    }
  }

  for (const tagId of excluded) best.delete(tagId);
  return [...best.values()];
}
