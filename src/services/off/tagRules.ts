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
    | 'name_keyword';
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

export type TagInput = {
  name: string;
  brand?: string | null;
  categoriesTags: string[];
  allergensTags: string[];
  tracesTags: string[];
  additivesTags: string[];
  ingredientsText: string | null;
  novaGroup: number | null;
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
