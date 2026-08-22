export type TagRuleSeed = {
  tagKey: string;
  matchType:
    | 'off_allergen'
    | 'off_trace'
    | 'off_category'
    | 'off_additive'
    | 'ingredient_keyword'
    | 'name_keyword';
  pattern: string;
  confidence?: 'certain' | 'likely' | 'trace';
  /** Negative rules EXCLUDE the tag — without them every "glutenfreies Brot"
   * gets tagged gluten by keyword. */
  isNegative?: boolean;
};

/**
 * Open Food Facts knows allergens, ingredients, categories and additives. It
 * knows nothing about histamine, FODMAP, nightshades or salicylates — those
 * tags exist only because of these rules, and the whole suspicion ranking
 * rests on them. Expect to edit this file repeatedly in the first year; that is
 * why off_product.raw is kept, so rules can be re-applied without refetching.
 *
 * Manual tags always win over rule-derived ones.
 */
export const TAG_RULES: TagRuleSeed[] = [
  // Negative rules first — they are what makes keyword matching safe at all.
  {
    tagKey: 'gluten',
    matchType: 'name_keyword',
    pattern: 'glutenfrei|gluten-frei',
    isNegative: true,
  },
  {
    tagKey: 'lactose',
    matchType: 'name_keyword',
    pattern: 'laktosefrei|lactosefrei|laktose-frei',
    isNegative: true,
  },
  {
    tagKey: 'milk_protein',
    matchType: 'name_keyword',
    pattern: 'vegan',
    isNegative: true,
  },
  {
    tagKey: 'alcohol',
    matchType: 'name_keyword',
    pattern: 'alkoholfrei',
    isNegative: true,
  },
  {
    tagKey: 'caffeine',
    matchType: 'name_keyword',
    pattern: 'entkoffeiniert|koffeinfrei',
    isNegative: true,
  },

  // Gluten
  {
    tagKey: 'gluten',
    matchType: 'off_allergen',
    pattern: 'en:gluten',
    confidence: 'certain',
  },
  {
    tagKey: 'gluten',
    matchType: 'ingredient_keyword',
    pattern:
      'weizen|dinkel|gerste|roggen|malz|grieß|couscous|bulgur|seitan|emmer|einkorn|kamut',
    confidence: 'likely',
  },
  {
    tagKey: 'grain',
    matchType: 'ingredient_keyword',
    pattern: 'weizen|dinkel|gerste|roggen|hafer|reis|mais|hirse',
  },

  // Milk
  {
    tagKey: 'lactose',
    matchType: 'off_allergen',
    pattern: 'en:milk',
    confidence: 'likely',
  },
  {
    tagKey: 'milk_protein',
    matchType: 'off_allergen',
    pattern: 'en:milk',
    confidence: 'likely',
  },
  { tagKey: 'dairy', matchType: 'off_allergen', pattern: 'en:milk' },
  {
    tagKey: 'lactose',
    matchType: 'ingredient_keyword',
    pattern: 'milch|sahne|rahm|butter|quark|joghurt|molke|kondensmilch',
  },

  // Legumes, soy, nuts, seeds
  {
    tagKey: 'soy',
    matchType: 'off_allergen',
    pattern: 'en:soybeans',
    confidence: 'likely',
  },
  {
    tagKey: 'soy',
    matchType: 'off_trace',
    pattern: 'en:soybeans',
    confidence: 'trace',
  },
  {
    tagKey: 'legume',
    matchType: 'ingredient_keyword',
    pattern: 'linsen|kichererbsen|bohnen|erbsen|lupine',
  },
  {
    tagKey: 'nuts',
    matchType: 'off_allergen',
    pattern: 'en:nuts',
    confidence: 'certain',
  },
  {
    tagKey: 'nuts',
    matchType: 'off_trace',
    pattern: 'en:nuts',
    confidence: 'trace',
  },
  {
    tagKey: 'peanut',
    matchType: 'off_allergen',
    pattern: 'en:peanuts',
    confidence: 'certain',
  },
  {
    tagKey: 'peanut',
    matchType: 'off_trace',
    pattern: 'en:peanuts',
    confidence: 'trace',
  },
  {
    tagKey: 'sesame',
    matchType: 'off_allergen',
    pattern: 'en:sesame-seeds',
    confidence: 'certain',
  },

  // Egg, fish, shellfish
  {
    tagKey: 'egg',
    matchType: 'off_allergen',
    pattern: 'en:eggs',
    confidence: 'certain',
  },
  {
    tagKey: 'fish',
    matchType: 'off_allergen',
    pattern: 'en:fish',
    confidence: 'certain',
  },
  { tagKey: 'fish_group', matchType: 'off_allergen', pattern: 'en:fish' },
  {
    tagKey: 'shellfish',
    matchType: 'off_allergen',
    pattern: 'en:crustaceans|en:molluscs',
    confidence: 'certain',
  },
  {
    tagKey: 'oily_fish',
    matchType: 'name_keyword',
    pattern: 'lachs|makrele|hering|sardine|sardelle|thunfisch|forelle',
  },
  {
    tagKey: 'omega3',
    matchType: 'name_keyword',
    pattern: 'lachs|makrele|hering|sardine|leinöl|walnussöl|rapsöl|chia',
  },

  // Celery, mustard
  {
    tagKey: 'celery',
    matchType: 'off_allergen',
    pattern: 'en:celery',
    confidence: 'certain',
  },
  {
    tagKey: 'mustard',
    matchType: 'off_allergen',
    pattern: 'en:mustard',
    confidence: 'certain',
  },

  // Additives
  {
    tagKey: 'sulfite',
    matchType: 'off_allergen',
    pattern: 'en:sulphur-dioxide-and-sulphites',
    confidence: 'certain',
  },
  {
    tagKey: 'sulfite',
    matchType: 'off_additive',
    pattern: 'en:e22[0-8]',
    confidence: 'certain',
  },
  {
    tagKey: 'glutamate',
    matchType: 'off_additive',
    pattern: 'en:e62[0-5]',
    confidence: 'certain',
  },
  {
    tagKey: 'food_coloring',
    matchType: 'off_additive',
    pattern: 'en:e1[0-8][0-9]',
    confidence: 'certain',
  },
  {
    tagKey: 'preservative',
    matchType: 'off_additive',
    pattern: 'en:e2[0-1][0-9]',
    confidence: 'certain',
  },
  {
    tagKey: 'artificial_sweetener',
    matchType: 'off_additive',
    pattern: 'en:e95[0-9]|en:e96[0-9]',
    confidence: 'certain',
  },
  {
    tagKey: 'sorbitol',
    matchType: 'off_additive',
    pattern: 'en:e42[0-1]|en:e96[5-8]',
    confidence: 'certain',
  },
  {
    tagKey: 'sorbitol',
    matchType: 'ingredient_keyword',
    pattern: 'sorbit|xylit|maltit|erythrit|isomalt|mannit',
  },

  // Nightshades — not in OFF, keyword only.
  {
    tagKey: 'nightshade',
    matchType: 'ingredient_keyword',
    pattern: 'tomate|kartoffel|paprika|aubergine|chili|cayenne|goji|physalis',
    confidence: 'likely',
  },
  {
    tagKey: 'capsaicin',
    matchType: 'name_keyword',
    pattern: 'chili|scharf|sambal|harissa|peperoni|cayenne|sriracha',
  },

  // Histamine / biogenic amines — not in OFF, keyword only.
  {
    tagKey: 'histamine',
    matchType: 'name_keyword',
    pattern:
      'rotwein|weißwein|sekt|bier|salami|schinken|parmesan|gouda|emmentaler|camembert|sauerkraut|thunfisch|makrele|geräuchert|sojasauce|essig|hefeextrakt',
    confidence: 'likely',
  },
  {
    tagKey: 'histamine_liberator',
    matchType: 'name_keyword',
    pattern:
      'erdbeer|zitrone|orange|ananas|tomate|schokolade|kakao|nuss|meeresfrüchte',
    confidence: 'likely',
  },
  {
    tagKey: 'tyramine',
    matchType: 'name_keyword',
    pattern:
      'reifer käse|parmesan|blauschimmel|roquefort|salami|sojasauce|hefeextrakt',
    confidence: 'likely',
  },
  {
    tagKey: 'fermented',
    matchType: 'name_keyword',
    pattern: 'sauerkraut|kimchi|kombucha|kefir|miso|tempeh|joghurt',
  },

  // FODMAP / fructose / salicylates — not in OFF, keyword only.
  {
    tagKey: 'fodmap_high',
    matchType: 'ingredient_keyword',
    pattern:
      'zwiebel|knoblauch|weizen|apfel|birne|honig|inulin|fruktose-glukose-sirup|topinambur',
    confidence: 'likely',
  },
  {
    tagKey: 'fructose',
    matchType: 'ingredient_keyword',
    pattern:
      'fruktose|fructose|fruchtzucker|glukose-fruktose-sirup|maissirup|honig|agavensirup',
    confidence: 'likely',
  },
  {
    tagKey: 'salicylate',
    matchType: 'name_keyword',
    pattern:
      'himbeer|brombeer|aprikose|pflaume|curry|paprikapulver|minze|thymian|oregano',
    confidence: 'likely',
  },
  {
    tagKey: 'citrus',
    matchType: 'name_keyword',
    pattern: 'zitrone|orange|mandarine|grapefruit|limette|clementine',
  },

  // Yeast, caffeine, alcohol
  {
    tagKey: 'yeast',
    matchType: 'ingredient_keyword',
    pattern: 'hefe|hefeextrakt|backhefe',
  },
  {
    tagKey: 'caffeine',
    matchType: 'name_keyword',
    pattern:
      'kaffee|espresso|cappuccino|latte|schwarztee|grüntee|mate|cola|energy',
  },
  {
    tagKey: 'alcohol',
    matchType: 'name_keyword',
    pattern:
      'wein|bier|sekt|prosecco|likör|schnaps|whisky|gin|wodka|rum|aperol',
  },
  {
    tagKey: 'alcoholic_beverage',
    matchType: 'name_keyword',
    pattern: 'wein|bier|sekt|prosecco|likör|schnaps|whisky|gin|wodka|rum',
  },

  // Processing level and dietary pattern
  {
    tagKey: 'ultra_processed',
    matchType: 'off_category',
    pattern: 'nova:4',
    confidence: 'likely',
  },
  {
    tagKey: 'processed_meat',
    matchType: 'name_keyword',
    pattern:
      'wurst|salami|schinken|speck|bacon|leberwurst|mortadella|würstchen',
  },
  {
    tagKey: 'red_meat',
    matchType: 'name_keyword',
    pattern: 'rind|schwein|lamm|kalb|hack|steak',
  },
  {
    tagKey: 'arachidonic_acid',
    matchType: 'name_keyword',
    pattern: 'schweineschmalz|leber|eigelb|rind',
  },
  {
    tagKey: 'whole_grain',
    matchType: 'name_keyword',
    pattern: 'vollkorn|vollmehl|schrot',
  },
  { tagKey: 'olive_oil', matchType: 'name_keyword', pattern: 'olivenöl' },
  {
    tagKey: 'high_sugar',
    matchType: 'off_category',
    pattern: 'en:sweet-snacks|en:sugary-snacks',
    confidence: 'likely',
  },
  {
    tagKey: 'sweets',
    matchType: 'off_category',
    pattern: 'en:sweet-snacks|en:chocolates|en:candies',
  },
  {
    tagKey: 'vegetable',
    matchType: 'off_category',
    pattern: 'en:vegetables|en:legumes',
  },
  { tagKey: 'fruit', matchType: 'off_category', pattern: 'en:fruits' },
  { tagKey: 'beverage', matchType: 'off_category', pattern: 'en:beverages' },
  {
    tagKey: 'ready_meal',
    matchType: 'off_category',
    pattern: 'en:meals|en:prepared-meals',
  },
];
