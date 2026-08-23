/**
 * Seeds `food_catalog` from the committed data module.
 *
 * `data/bls-4.0.ts` is produced by `src/db/scripts/import-bls.ts` and is the
 * artefact, not the XLSX. It is a module and not a .csv on purpose: this runs
 * inside the esbuild-bundled migrate init container on every deploy, where a
 * file read by path would not exist.
 *
 * Max Rubner-Institut (2025), Bundeslebensmittelschlüssel 4.0, CC BY 4.0,
 * DOI 10.25826/Data20251217-134202-0.
 */
import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { foodCatalog } from '../schema';
import { BLS_CSV } from './data/bls-4.0';
import { BLS_ALIASES } from './data/bls-aliases';
import { BLS_EVERYDAY_CODES } from './data/bls-everyday';

type Database = PostgresJsDatabase<Record<string, unknown>>;

/**
 * Postgres caps a statement at 65535 bound parameters. At 48 columns that is
 * ~1360 rows, so 400 leaves head-room and keeps each statement small enough
 * that a failure is readable. It was 500 while the table had 23 columns; the
 * number is worth re-checking whenever a column is added.
 */
const BATCH_SIZE = 400;

/** Minimal RFC-4180 reader. The BLS names contain commas and quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') field += char;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** '' is NULL (not measured), never 0 — the difference decides trigger tags. */
function numberOrNull(value: string | undefined): number | null {
  const text = (value ?? '').trim();
  if (text === '') return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export type CatalogSeedRow = typeof foodCatalog.$inferInsert;

/**
 * CSV column -> drizzle property, ONE list feeding both the row build and the
 * upsert's `set`.
 *
 * They used to be two hand-maintained lists, and a nutrient missing from the
 * `set` is completely silent: the first seed writes it, the second one does not
 * update it, and nothing ever says so. With forty-five columns that stopped
 * being a theoretical risk. `db:check` asserts idempotency on top.
 */
const CATALOG_COLUMNS = [
  ['kcal_100', 'kcal100'],
  ['protein_100', 'protein100'],
  ['fat_100', 'fat100'],
  ['sat_fat_100', 'satFat100'],
  ['carbs_100', 'carbs100'],
  ['sugar_100', 'sugar100'],
  ['fiber_100', 'fiber100'],
  ['salt_100', 'salt100'],
  ['lactose_100', 'lactose100'],
  ['fructose_100', 'fructose100'],
  ['glucose_100', 'glucose100'],
  ['sorbitol_100', 'sorbitol100'],
  ['mannitol_100', 'mannitol100'],
  ['alcohol_100', 'alcohol100'],
  ['omega3_100', 'omega3100'],
  ['epa_dha_100', 'epaDha100'],
  ['arachidonic_100', 'arachidonic100'],
  ['fiber_soluble_100', 'fiberSoluble100'],
  ['mufa_100', 'mufa100'],
  ['pufa_100', 'pufa100'],
  ['omega6_100', 'omega6100'],
  ['linoleic_100', 'linoleic100'],
  ['ala_100', 'ala100'],
  ['vit_a_100', 'vitA100'],
  ['vit_d_100', 'vitD100'],
  ['vit_e_100', 'vitE100'],
  ['vit_k_100', 'vitK100'],
  ['vit_c_100', 'vitC100'],
  ['vit_b1_100', 'vitB1100'],
  ['vit_b2_100', 'vitB2100'],
  ['niacin_eq_100', 'niacinEq100'],
  ['vit_b6_100', 'vitB6100'],
  ['folate_100', 'folate100'],
  ['vit_b12_100', 'vitB12100'],
  ['calcium_100', 'calcium100'],
  ['magnesium_100', 'magnesium100'],
  ['iron_100', 'iron100'],
  ['zinc_100', 'zinc100'],
  ['iodine_100', 'iodine100'],
  ['potassium_100', 'potassium100'],
  ['phosphorus_100', 'phosphorus100'],
  ['sodium_100', 'sodium100'],
] as const satisfies readonly (readonly [string, keyof CatalogSeedRow])[];

export function rowsFromCsv(text: string): CatalogSeedRow[] {
  const [header, ...body] = parseCsv(text);
  if (!header) throw new Error('BLS_CSV is empty');
  const at = (row: string[], column: string) => row[header.indexOf(column)];
  const everyday = new Set(BLS_EVERYDAY_CODES);
  const aliases = new Map(BLS_ALIASES.map((a) => [a.code, a.terms]));

  return body
    .filter((row) => row.length > 1 && (at(row, 'bls_code') ?? '') !== '')
    .map((row) => {
      const nutrients: Record<string, number | null> = {};
      for (const [csv, column] of CATALOG_COLUMNS) {
        nutrients[column] = numberOrNull(at(row, csv));
      }
      return {
        blsCode: at(row, 'bls_code')!,
        nameDe: at(row, 'name_de')!,
        groupKey: at(row, 'group_key')!,
        isEveryday: everyday.has(at(row, 'bls_code')!),
        searchAlias: aliases.get(at(row, 'bls_code')!) ?? null,
        ...nutrients,
      } as CatalogSeedRow;
    });
}

/**
 * Idempotent on `bls_code`, which is NOT NULL — so unlike the lookup tables in
 * lookup.ts this needs no NULLS NOT DISTINCT dance and ON CONFLICT simply
 * matches. `db:check` still asserts the row count and the values across two
 * runs.
 */
export async function seedFoodCatalog(db: Database): Promise<number> {
  const rows = rowsFromCsv(BLS_CSV);

  const set: Record<string, ReturnType<typeof sql>> = {
    nameDe: sql`excluded.name_de`,
    groupKey: sql`excluded.group_key`,
    isEveryday: sql`excluded.is_everyday`,
    searchAlias: sql`excluded.search_alias`,
  };
  for (const [csv, column] of CATALOG_COLUMNS) {
    set[column] = sql.raw(`excluded.${csv}`);
  }

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await db
      .insert(foodCatalog)
      .values(rows.slice(i, i + BATCH_SIZE))
      .onConflictDoUpdate({
        target: foodCatalog.blsCode,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        set: set as any,
      });
  }
  return rows.length;
}
