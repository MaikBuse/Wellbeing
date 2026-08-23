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
 * Postgres caps a statement at 65535 bound parameters. At 23 columns that is
 * ~2800 rows, so 500 leaves plenty of head-room and keeps each statement small
 * enough that a failure is readable.
 */
const BATCH_SIZE = 500;

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

export function rowsFromCsv(text: string): CatalogSeedRow[] {
  const [header, ...body] = parseCsv(text);
  if (!header) throw new Error('BLS_CSV is empty');
  const at = (row: string[], column: string) => row[header.indexOf(column)];
  const everyday = new Set(BLS_EVERYDAY_CODES);
  const aliases = new Map(BLS_ALIASES.map((a) => [a.code, a.terms]));

  return body
    .filter((row) => row.length > 1 && (at(row, 'bls_code') ?? '') !== '')
    .map((row) => ({
      blsCode: at(row, 'bls_code')!,
      nameDe: at(row, 'name_de')!,
      groupKey: at(row, 'group_key')!,
      isEveryday: everyday.has(at(row, 'bls_code')!),
      searchAlias: aliases.get(at(row, 'bls_code')!) ?? null,
      kcal100: numberOrNull(at(row, 'kcal_100')),
      protein100: numberOrNull(at(row, 'protein_100')),
      fat100: numberOrNull(at(row, 'fat_100')),
      satFat100: numberOrNull(at(row, 'sat_fat_100')),
      carbs100: numberOrNull(at(row, 'carbs_100')),
      sugar100: numberOrNull(at(row, 'sugar_100')),
      fiber100: numberOrNull(at(row, 'fiber_100')),
      salt100: numberOrNull(at(row, 'salt_100')),
      lactose100: numberOrNull(at(row, 'lactose_100')),
      fructose100: numberOrNull(at(row, 'fructose_100')),
      glucose100: numberOrNull(at(row, 'glucose_100')),
      sorbitol100: numberOrNull(at(row, 'sorbitol_100')),
      mannitol100: numberOrNull(at(row, 'mannitol_100')),
      alcohol100: numberOrNull(at(row, 'alcohol_100')),
      omega3100: numberOrNull(at(row, 'omega3_100')),
      epaDha100: numberOrNull(at(row, 'epa_dha_100')),
      arachidonic100: numberOrNull(at(row, 'arachidonic_100')),
    }));
}

/**
 * Idempotent on `bls_code`, which is NOT NULL — so unlike the lookup tables in
 * lookup.ts this needs no NULLS NOT DISTINCT dance and ON CONFLICT simply
 * matches. `db:check` still asserts the row count across two runs.
 */
export async function seedFoodCatalog(db: Database): Promise<number> {
  const rows = rowsFromCsv(BLS_CSV);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await db
      .insert(foodCatalog)
      .values(rows.slice(i, i + BATCH_SIZE))
      .onConflictDoUpdate({
        target: foodCatalog.blsCode,
        set: {
          nameDe: sql`excluded.name_de`,
          groupKey: sql`excluded.group_key`,
          isEveryday: sql`excluded.is_everyday`,
          searchAlias: sql`excluded.search_alias`,
          kcal100: sql`excluded.kcal_100`,
          protein100: sql`excluded.protein_100`,
          fat100: sql`excluded.fat_100`,
          satFat100: sql`excluded.sat_fat_100`,
          carbs100: sql`excluded.carbs_100`,
          sugar100: sql`excluded.sugar_100`,
          fiber100: sql`excluded.fiber_100`,
          salt100: sql`excluded.salt_100`,
          lactose100: sql`excluded.lactose_100`,
          fructose100: sql`excluded.fructose_100`,
          glucose100: sql`excluded.glucose_100`,
          sorbitol100: sql`excluded.sorbitol_100`,
          mannitol100: sql`excluded.mannitol_100`,
          alcohol100: sql`excluded.alcohol_100`,
          omega3100: sql`excluded.omega3_100`,
          epaDha100: sql`excluded.epa_dha_100`,
          arachidonic100: sql`excluded.arachidonic_100`,
        },
      });
  }
  return rows.length;
}
