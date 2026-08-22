/**
 * One-off converter: the Bundeslebensmittelschlüssel 4.0 XLSX into the seed
 * module `src/db/seed/data/bls-4.0.ts`. Run once per BLS release; the output is
 * committed.
 *
 * The output is a TS module holding CSV text rather than a .csv file, and that
 * is not decoration. `src/db/migrate.ts` is bundled by esbuild into
 * /app/migrate.mjs (see the Dockerfile), so a data file read by path at runtime
 * would simply not exist in the init container — the same trap the Dockerfile
 * already documents for drizzle/*.sql. A module gets bundled with the code, so
 * dev and the cluster read the identical bytes. It stays CSV inside the string
 * so the diff of a BLS release is still readable line by line.
 *
 * Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 —
 * Deutsche Nährstoffdatenbank. Karlsruhe. DOI 10.25826/Data20251217-134202-0.
 * Licensed CC BY 4.0 — the attribution is required and lives in README.md and
 * on /settings.
 *
 *   curl -o bls.zip 'https://blsdb.de/download'   # follow the link on the page
 *   unzip -o bls.zip
 *   unzip -o BLS_4_0_2025_DE/BLS_4_0_Daten_2025_DE.xlsx -d bls-xml/
 *   npx tsx src/db/scripts/import-bls.ts bls-xml/ src/db/seed/data/bls-4.0.ts
 *
 * An xlsx is a zip, so the second unzip is what lets this file stay free of a
 * zip reader and of a spreadsheet dependency. It is worth it: `sheet1.xml` is
 * 99.6 MB uncompressed and has to be streamed either way.
 */
import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Zero-based column indices in the BLS sheet. Every nutrient occupies three
 * columns — value, `Datenherkunft`, `Referenz` — so these are not contiguous.
 * Verified against the header row of BLS 4.0; re-check on the next release.
 */
export const BLS_COLUMNS = {
  code: 0,
  name: 1,
  kcal: 6,
  protein: 12,
  fat: 15,
  carbs: 18,
  fiber: 21,
  alcohol: 24,
  sodium: 123, // mg, not g
  mannitol: 186,
  sorbitol: 189,
  xylitol: 192,
  glucose: 198,
  fructose: 201,
  lactose: 216,
  sugar: 219,
  satFat: 246,
  omega3: 312,
  epa: 321,
  dha: 327,
  arachidonic: 348,
} as const;

/** The header cells those indices must contain, as a guard against a silently
 * reshuffled release. Prefixes, because the full labels carry units. */
export const BLS_HEADER_PREFIXES: Record<keyof typeof BLS_COLUMNS, string> = {
  code: 'BLS Code',
  name: 'Lebensmittelbezeichnung',
  kcal: 'ENERCC',
  protein: 'PROT625',
  fat: 'FAT ',
  carbs: 'CHO ',
  fiber: 'FIBT',
  alcohol: 'ALC ',
  sodium: 'NA ',
  mannitol: 'MANTL',
  sorbitol: 'SORTL',
  xylitol: 'XYLTL',
  glucose: 'GLUS',
  fructose: 'FRUS',
  lactose: 'LACS',
  sugar: 'SUGAR',
  satFat: 'FASAT',
  omega3: 'FAPUN3',
  epa: 'F20:5CN3',
  dha: 'F22:6CN3',
  arachidonic: 'F20:4CN6',
};

export const CSV_HEADER = [
  'bls_code',
  'name_de',
  'group_key',
  'kcal_100',
  'protein_100',
  'fat_100',
  'sat_fat_100',
  'carbs_100',
  'sugar_100',
  'fiber_100',
  'salt_100',
  'lactose_100',
  'fructose_100',
  'glucose_100',
  'sorbitol_100',
  'mannitol_100',
  'alcohol_100',
  'omega3_100',
  'epa_dha_100',
  'arachidonic_100',
] as const;

export function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(+code))
    .replace(/&amp;/g, '&'); // last, so "&amp;lt;" does not become "<"
}

/** `<si>` may be split into several `<t>` runs; they concatenate. */
export function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const items = xml.match(/<si>[\s\S]*?<\/si>|<si\/>/g) ?? [];
  for (const item of items) {
    let text = '';
    for (const run of item.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) ?? []) {
      text += run.replace(/^<t(?:\s[^>]*)?>/, '').replace(/<\/t>$/, '');
    }
    out.push(decodeXmlEntities(text));
  }
  return out;
}

/**
 * "GT2" -> 201. Reading the cell reference rather than counting `<c>` elements
 * is not pedantry: xlsx omits empty cells entirely, so a positional read
 * silently shifts every nutrient left on any row with a gap.
 */
export function columnIndexFromRef(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref)?.[1];
  if (!letters) throw new Error(`unparseable cell reference: ${ref}`);
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

/**
 * A nutrient cell is a number, empty, or a below-detection sentinel
 * (`<LOD`, `<LOD or <LOQ`).
 *
 * The sentinel becomes 0 and an empty cell becomes null, and the difference
 * matters downstream: "measured, none detectable" must be allowed to withhold a
 * trigger tag, while "not measured" must never decide anything either way. See
 * the null handling in `bls_measured` rules.
 */
export function parseMeasured(raw: string | undefined): number | null {
  const text = (raw ?? '').trim();
  if (text === '') return null;
  if (text.startsWith('<')) return 0;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** Sodium mg/100 g -> salt g/100 g, the usual NaCl factor. */
export function saltFromSodiumMg(sodiumMg: number | null): number | null {
  if (sodiumMg === null) return null;
  return (sodiumMg * 2.5) / 1000;
}

/** The leading letter of the BLS code is the main food group. */
export function blsGroupKey(code: string): string {
  return code.slice(0, 1).toUpperCase();
}

/** Beverages: alcohol-free (N) and alcoholic (P) drinks are measured per ml. */
export function isBeverageGroup(groupKey: string): boolean {
  return groupKey === 'N' || groupKey === 'P';
}

/**
 * Dot decimals, deliberately. `germanNumber` exists for what a person types
 * into a form; a data file uses the machine format, and a decimal comma would
 * collide with the delimiter.
 */
export function formatNumber(value: number | null, scale: number): string {
  if (value === null) return '';
  const rounded = Number(value.toFixed(scale));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

export function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export type BlsRow = Record<(typeof CSV_HEADER)[number], string>;

/** Cells of one sheet row, indexed by true column. */
export function rowToBls(cells: (string | undefined)[]): BlsRow | null {
  const code = (cells[BLS_COLUMNS.code] ?? '').trim();
  const name = (cells[BLS_COLUMNS.name] ?? '').trim();
  if (code === '' || name === '') return null;

  const at = (key: keyof typeof BLS_COLUMNS) =>
    parseMeasured(cells[BLS_COLUMNS[key]]);

  // Sorbitol and mannitol are the two polyols a FODMAP rule cares about;
  // xylitol is folded in here because it is the same axis and is otherwise a
  // column nothing would ever read.
  const sorbitol = at('sorbitol');
  const xylitol = at('xylitol');
  const sorbitolTotal =
    sorbitol === null && xylitol === null ? null : (sorbitol ?? 0) + (xylitol ?? 0);

  const epa = at('epa');
  const dha = at('dha');
  const epaDha = epa === null && dha === null ? null : (epa ?? 0) + (dha ?? 0);

  const g = (key: keyof typeof BLS_COLUMNS) => formatNumber(at(key), 3);

  return {
    bls_code: code,
    name_de: name,
    group_key: blsGroupKey(code),
    kcal_100: formatNumber(at('kcal'), 1),
    protein_100: formatNumber(at('protein'), 2),
    fat_100: formatNumber(at('fat'), 2),
    sat_fat_100: formatNumber(at('satFat'), 2),
    carbs_100: formatNumber(at('carbs'), 2),
    sugar_100: formatNumber(at('sugar'), 2),
    fiber_100: formatNumber(at('fiber'), 2),
    salt_100: formatNumber(saltFromSodiumMg(at('sodium')), 3),
    lactose_100: g('lactose'),
    fructose_100: g('fructose'),
    glucose_100: g('glucose'),
    sorbitol_100: formatNumber(sorbitolTotal, 3),
    mannitol_100: g('mannitol'),
    alcohol_100: g('alcohol'),
    omega3_100: g('omega3'),
    epa_dha_100: formatNumber(epaDha, 3),
    arachidonic_100: g('arachidonic'),
  };
}

export function toCsvLine(row: BlsRow): string {
  return CSV_HEADER.map((column) => csvEscape(row[column])).join(',');
}

/** Cells of a single `<row>` element, placed at their true column index. */
export function parseSheetRow(
  xml: string,
  sharedStrings: string[]
): (string | undefined)[] {
  const cells: (string | undefined)[] = [];
  const cellRe = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let match: RegExpExecArray | null;
  while ((match = cellRe.exec(xml)) !== null) {
    const [, attributes, body] = match;
    const ref = /\br="([A-Z]+\d+)"/.exec(attributes)?.[1];
    if (!ref) continue;
    const type = /\bt="([^"]*)"/.exec(attributes)?.[1];
    const index = columnIndexFromRef(ref);

    if (type === 'inlineStr') {
      const runs = body?.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) ?? [];
      cells[index] = decodeXmlEntities(
        runs
          .map((run) =>
            run.replace(/^<t(?:\s[^>]*)?>/, '').replace(/<\/t>$/, '')
          )
          .join('')
      );
      continue;
    }

    const raw = /<v>([\s\S]*?)<\/v>/.exec(body ?? '')?.[1];
    if (raw === undefined) continue;
    cells[index] =
      type === 's' ? sharedStrings[Number(raw)] : decodeXmlEntities(raw);
  }
  return cells;
}

function module_(csv: string): string {
  return `/**
 * Bundeslebensmittelschlüssel 4.0 — generated, do not edit by hand.
 *
 * Regenerate with src/db/scripts/import-bls.ts; the header there has the two
 * unzip commands. Seeded by src/db/seed/bls.ts.
 *
 * A module rather than a .csv because src/db/migrate.ts is esbuild-bundled into
 * the migrate init container, where a file read by path would not exist.
 *
 * Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 —
 * Deutsche Nährstoffdatenbank. Karlsruhe. DOI 10.25826/Data20251217-134202-0.
 * Licensed CC BY 4.0.
 */
export const BLS_CSV = \`${csv}\`;
`;
}

async function main(): Promise<void> {
  const [inputDir, outputPath] = process.argv.slice(2);
  if (!inputDir || !outputPath) {
    console.error(
      'usage: tsx src/db/scripts/import-bls.ts <unzipped-xlsx-dir> <out.ts>'
    );
    process.exit(2);
  }

  const sharedStrings = parseSharedStrings(
    await readFile(join(inputDir, 'xl/sharedStrings.xml'), 'utf8')
  );
  console.log(`shared strings: ${sharedStrings.length}`);

  const lines: string[] = [CSV_HEADER.join(',')];
  let headerChecked = false;
  let skipped = 0;

  // 99.6 MB of XML: stream it and cut on the row boundary rather than holding
  // the document, and never build a DOM.
  const stream = createReadStream(join(inputDir, 'xl/worksheets/sheet1.xml'), {
    encoding: 'utf8',
  });
  let buffer = '';
  for await (const chunk of stream) {
    buffer += chunk;
    let end: number;
    while ((end = buffer.indexOf('</row>')) !== -1) {
      const start = buffer.lastIndexOf('<row', end);
      const rowXml = start === -1 ? '' : buffer.slice(start, end);
      buffer = buffer.slice(end + '</row>'.length);
      if (rowXml === '') continue;

      const cells = parseSheetRow(rowXml, sharedStrings);

      if (!headerChecked) {
        headerChecked = true;
        for (const [key, index] of Object.entries(BLS_COLUMNS)) {
          const actual = cells[index] ?? '';
          const expected =
            BLS_HEADER_PREFIXES[key as keyof typeof BLS_COLUMNS];
          if (!actual.startsWith(expected)) {
            throw new Error(
              `column ${index} should start with "${expected}" but is "${actual}" — the BLS layout changed, re-derive BLS_COLUMNS`
            );
          }
        }
        continue;
      }

      const row = rowToBls(cells);
      if (row === null) {
        skipped += 1;
        continue;
      }
      lines.push(toCsvLine(row));
    }
  }

  const csv = lines.join('\n') + '\n';
  // Defensive: no BLS name contains these today, and a template literal that
  // silently swallowed one would be a very quiet corruption.
  if (/[`\\]|\$\{/.test(csv)) {
    throw new Error('data contains a backtick, backslash or ${ — escape it');
  }

  await writeFile(outputPath, module_(csv), 'utf8');
  console.log(
    `wrote ${lines.length - 1} foods to ${outputPath}` +
      (skipped > 0 ? ` (${skipped} rows without code or name skipped)` : '')
  );
}

// Only when invoked directly — the pure helpers above are unit-tested.
if (process.argv[1]?.endsWith('import-bls.ts')) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
