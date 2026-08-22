/**
 * Open Food Facts client. Server-side only.
 *
 * Notes that are easy to get wrong:
 *  - world.openfoodfacts.ORG, not .net (.net is the staging server).
 *  - The User-Agent is mandatory per OFF policy and must identify the app;
 *    requests without one get throttled. Node's fetch will happily send its
 *    default UA if we forget.
 *  - `fields=` is not politeness: full product documents are hundreds of KB.
 *  - Products are cached in our own DB, so repeat scans never hit OFF and the
 *    app keeps working when OFF is down.
 */
import { z } from 'zod';

const OFF_BASE = 'https://world.openfoodfacts.org/api/v2/product';

const FIELDS = [
  'code',
  'product_name',
  'product_name_de',
  'brands',
  'quantity',
  'serving_size',
  'categories_tags',
  'allergens_tags',
  'traces_tags',
  'additives_tags',
  'ingredients_text',
  'ingredients_text_de',
  'nova_group',
  'nutriments',
].join(',');

const nutrimentsSchema = z
  .object({
    'energy-kcal_100g': z.number().optional(),
    energy_100g: z.number().optional(),
    proteins_100g: z.number().optional(),
    fat_100g: z.number().optional(),
    'saturated-fat_100g': z.number().optional(),
    carbohydrates_100g: z.number().optional(),
    sugars_100g: z.number().optional(),
    fiber_100g: z.number().optional(),
    salt_100g: z.number().optional(),
  })
  .passthrough();

const productSchema = z.object({
  code: z.string().optional(),
  product_name: z.string().optional(),
  product_name_de: z.string().optional(),
  brands: z.string().optional(),
  quantity: z.string().optional(),
  serving_size: z.string().optional(),
  categories_tags: z.array(z.string()).optional(),
  allergens_tags: z.array(z.string()).optional(),
  traces_tags: z.array(z.string()).optional(),
  additives_tags: z.array(z.string()).optional(),
  ingredients_text: z.string().optional(),
  ingredients_text_de: z.string().optional(),
  nova_group: z.number().optional(),
  nutriments: nutrimentsSchema.optional(),
});

const responseSchema = z.object({
  status: z.union([z.number(), z.string()]).optional(),
  product: productSchema.optional(),
});

export type OffProductData = {
  barcode: string;
  productName: string | null;
  brands: string | null;
  quantity: string | null;
  servingSize: string | null;
  categoriesTags: string[];
  allergensTags: string[];
  tracesTags: string[];
  additivesTags: string[];
  ingredientsText: string | null;
  novaGroup: number | null;
  kcal100: number | null;
  protein100: number | null;
  fat100: number | null;
  satFat100: number | null;
  carbs100: number | null;
  sugar100: number | null;
  fiber100: number | null;
  salt100: number | null;
  raw: Record<string, unknown>;
  /** kcal missing or zero — route the user to the manual form instead of
   * logging a 0-kcal entry. */
  needsManualNutrients: boolean;
};

export type OffLookupResult =
  | { kind: 'found'; product: OffProductData }
  | { kind: 'not_found' }
  | { kind: 'error'; reason: 'timeout' | 'upstream' | 'invalid' };

export const OFF_ERROR_MESSAGES: Record<string, string> = {
  timeout: 'Open Food Facts antwortet nicht. Bitte manuell eintragen.',
  upstream: 'Open Food Facts ist gerade nicht erreichbar.',
  invalid: 'Die Antwort von Open Food Facts war unbrauchbar.',
  not_found:
    'Dieses Produkt kennt Open Food Facts nicht. Du kannst es selbst anlegen.',
};

function kcalFrom(n: z.infer<typeof nutrimentsSchema>): number | null {
  const kcal = n['energy-kcal_100g'];
  if (typeof kcal === 'number' && kcal > 0) return kcal;
  // Some entries only carry kJ.
  const kj = n['energy_100g'];
  if (typeof kj === 'number' && kj > 0) return Math.round(kj / 4.184);
  return null;
}

export async function lookupOffProduct(
  barcode: string
): Promise<OffLookupResult> {
  const userAgent = process.env.OFF_USER_AGENT ?? 'Wellbeing/1.0';
  const url = `${OFF_BASE}/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`;

  let payload: unknown;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      // Never let a slow upstream block a server action for 30 s.
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    if (response.status === 404) return { kind: 'not_found' };
    if (!response.ok) return { kind: 'error', reason: 'upstream' };
    payload = await response.json();
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    return {
      kind: 'error',
      reason:
        name === 'TimeoutError' || name === 'AbortError'
          ? 'timeout'
          : 'upstream',
    };
  }

  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) return { kind: 'error', reason: 'invalid' };

  const found =
    parsed.data.status === 1 ||
    parsed.data.status === '1' ||
    parsed.data.product !== undefined;
  const product = parsed.data.product;
  if (!found || !product) return { kind: 'not_found' };

  const nutriments = product.nutriments ?? {};
  const kcal100 = kcalFrom(nutriments);

  return {
    kind: 'found',
    product: {
      barcode,
      productName: product.product_name_de ?? product.product_name ?? null,
      brands: product.brands ?? null,
      quantity: product.quantity ?? null,
      servingSize: product.serving_size ?? null,
      categoriesTags: product.categories_tags ?? [],
      allergensTags: product.allergens_tags ?? [],
      tracesTags: product.traces_tags ?? [],
      additivesTags: product.additives_tags ?? [],
      ingredientsText:
        product.ingredients_text_de ?? product.ingredients_text ?? null,
      novaGroup: product.nova_group ?? null,
      kcal100,
      protein100: nutriments.proteins_100g ?? null,
      fat100: nutriments.fat_100g ?? null,
      satFat100: nutriments['saturated-fat_100g'] ?? null,
      carbs100: nutriments.carbohydrates_100g ?? null,
      sugar100: nutriments.sugars_100g ?? null,
      fiber100: nutriments.fiber_100g ?? null,
      salt100: nutriments.salt_100g ?? null,
      raw: product as unknown as Record<string, unknown>,
      needsManualNutrients: kcal100 === null,
    },
  };
}

/** "1 Scheibe (35 g)" / "30g" -> 35 / 30. Free text, so best effort only. */
export function parseServingGrams(servingSize: string | null): number | null {
  if (!servingSize) return null;
  const match = /([\d.,]+)\s*(g|ml)\b/i.exec(servingSize);
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}
