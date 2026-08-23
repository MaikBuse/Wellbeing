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
 * Which BLS nutrient goes into which column, keyed by the code in the header.
 *
 * THE HEADER IS THE TRUTH, the index is only what we expect to find. It used to
 * be the other way round — a hand-verified index with the header text as a
 * guard — and that stopped scaling the moment micronutrients were added: the
 * order in the sheet is not the order in the documentation (sodium sits at 123,
 * before the carbohydrates), so twenty-five more indices could not be derived
 * by reading anything.
 *
 * The header format is documented and unambiguous:
 *   `CODE Bezeichnung, Ergänzung (Erläuterung) [Einheit/100g]`
 * so a code matches on `header.startsWith(code + ' ')`. THE TRAILING SPACE IS
 * LORE, not formatting: without it `CA` also matches `CARTB`, `FOL` matches
 * `FOLFD` and `FOLAC`, `NIA` matches `NIAEQ`, `K` matches every `KCAL`-ish
 * column and `VITA` matches `VITAA`. Keep it on every short code.
 *
 * `expectedIndex: null` means "not verified against a release yet". The first
 * run prints the resolved table; paste it back in and commit, and from then on
 * a shifted release fails loudly instead of reading the neighbouring column.
 *
 * Note what is absent: SELENIUM. The BLS carries exactly sixteen elements —
 * NACL, NA, CLD, K, CA, MG, P, S, FE, ZN, ID, CU, MN, FD, CR, MO — and selenium
 * is not one of them. Adding a `SE ` entry here would resolve to nothing and
 * throw, which is the correct outcome and the reason it is written down.
 */
export const BLS_NUTRIENTS = {
  code: { prefix: 'BLS Code', expectedIndex: 0 },
  name: { prefix: 'Lebensmittelbezeichnung', expectedIndex: 1 },
  kcal: { prefix: 'ENERCC', expectedIndex: 6 },
  protein: { prefix: 'PROT625', expectedIndex: 12 },
  fat: { prefix: 'FAT ', expectedIndex: 15 },
  carbs: { prefix: 'CHO ', expectedIndex: 18 },
  fiber: { prefix: 'FIBT', expectedIndex: 21 },
  alcohol: { prefix: 'ALC ', expectedIndex: 24 },
  sodium: { prefix: 'NA ', expectedIndex: 123 }, // mg, not g
  mannitol: { prefix: 'MANTL', expectedIndex: 186 },
  sorbitol: { prefix: 'SORTL', expectedIndex: 189 },
  xylitol: { prefix: 'XYLTL', expectedIndex: 192 },
  glucose: { prefix: 'GLUS', expectedIndex: 198 },
  fructose: { prefix: 'FRUS', expectedIndex: 201 },
  lactose: { prefix: 'LACS', expectedIndex: 216 },
  sugar: { prefix: 'SUGAR', expectedIndex: 219 },
  satFat: { prefix: 'FASAT', expectedIndex: 246 },
  omega3: { prefix: 'FAPUN3', expectedIndex: 312 },
  epa: { prefix: 'F20:5CN3', expectedIndex: 321 },
  dha: { prefix: 'F22:6CN3', expectedIndex: 327 },
  arachidonic: { prefix: 'F20:4CN6', expectedIndex: 348 },

  /*
   * Micronutrients, for the nutrient-goal feature. Indices unverified until the
   * first run against BLS 4.0 prints them.
   *
   * EQUIVALENTS, NOT SINGLE FORMS, wherever D-A-CH states an equivalent:
   * `NIAEQ` not `NIA`, `VITA` (retinol equivalent) not `RETOL`. Picking the
   * single form gives plausible but systematically low numbers, which the
   * median plausibility check below would not reliably catch — it is the one
   * mistake here that has to be verified by eye against the nutrient list.
   */
  vitA: { prefix: 'VITA ', expectedIndex: null },
  vitD: { prefix: 'VITD ', expectedIndex: null },
  vitE: { prefix: 'VITE ', expectedIndex: null },
  vitK: { prefix: 'VITK ', expectedIndex: null },
  vitC: { prefix: 'VITC ', expectedIndex: null },
  vitB1: { prefix: 'THIA', expectedIndex: null },
  vitB2: { prefix: 'RIBF', expectedIndex: null },
  niacinEq: { prefix: 'NIAEQ', expectedIndex: null },
  vitB6: { prefix: 'VITB6', expectedIndex: null },
  folate: { prefix: 'FOL ', expectedIndex: null },
  vitB12: { prefix: 'VITB12', expectedIndex: null },
  calcium: { prefix: 'CA ', expectedIndex: null },
  magnesium: { prefix: 'MG ', expectedIndex: null },
  iron: { prefix: 'FE ', expectedIndex: null },
  zinc: { prefix: 'ZN ', expectedIndex: null },
  iodine: { prefix: 'ID ', expectedIndex: null },
  potassium: { prefix: 'K ', expectedIndex: null },
  phosphorus: { prefix: 'P ', expectedIndex: null },
  ala: { prefix: 'F18:3CN3', expectedIndex: null },
  omega6: { prefix: 'FAPUN6', expectedIndex: null },
  linoleic: { prefix: 'F18:2CN6', expectedIndex: null },
  mufa: { prefix: 'FAMS', expectedIndex: null },
  pufa: { prefix: 'FAPU ', expectedIndex: null },
  fiberSoluble: { prefix: 'FIBSOL', expectedIndex: null },
} as const satisfies Record<string, { prefix: string; expectedIndex: number | null }>;

export type BlsKey = keyof typeof BLS_NUTRIENTS;

export const BLS_KEYS = Object.keys(BLS_NUTRIENTS) as BlsKey[];

/**
 * Resolve every nutrient to its column, or fail loudly.
 *
 * Four ways this throws, and each one is a real failure mode rather than
 * defensive noise:
 *  - a prefix matches nothing: the release renamed or dropped a nutrient;
 *  - a prefix matches twice: it is ambiguous and would silently pick one;
 *  - the resolved index disagrees with `expectedIndex`: the layout shifted, and
 *    the message names both numbers so the diff is obvious;
 *  - two keys land on the same column, or one lands on another's `+1`/`+2`: the
 *    value/source/reference triple structure is broken.
 */
export function resolveColumns(
  header: readonly (string | undefined)[]
): Record<BlsKey, number> {
  const resolved = {} as Record<BlsKey, number>;

  for (const key of BLS_KEYS) {
    const { prefix, expectedIndex } = BLS_NUTRIENTS[key];
    const hits: number[] = [];
    header.forEach((cell, index) => {
      if ((cell ?? '').startsWith(prefix)) hits.push(index);
    });

    if (hits.length === 0) {
      throw new Error(
        `${key}: no header starts with "${prefix}" — the BLS layout changed`
      );
    }
    if (hits.length > 1) {
      throw new Error(
        `${key}: prefix "${prefix}" is ambiguous, it matches columns ${hits.join(', ')} (${hits
          .map((index) => header[index])
          .join(' | ')}) — add a trailing space or lengthen it`
      );
    }
    const index = hits[0];
    if (expectedIndex !== null && index !== expectedIndex) {
      throw new Error(
        `${key}: expected column ${expectedIndex} but found ${index} — the release shifted, update BLS_NUTRIENTS after checking`
      );
    }
    resolved[key] = index;
  }

  const seen = new Map<number, BlsKey>();
  for (const key of BLS_KEYS) {
    const index = resolved[key];
    const clash = seen.get(index);
    if (clash) throw new Error(`${key} and ${clash} both resolve to column ${index}`);
    seen.set(index, key);
  }
  // Every nutrient occupies three columns (value, Datenherkunft, Referenz), so
  // a value column landing on another's +1 or +2 means the triple is broken and
  // we would be reading a provenance code as a number.
  for (const key of BLS_KEYS) {
    if (key === 'code' || key === 'name') continue;
    for (const offset of [1, 2]) {
      const neighbour = seen.get(resolved[key] - offset);
      if (neighbour && neighbour !== 'code' && neighbour !== 'name') {
        throw new Error(
          `${key} sits ${offset} column(s) after ${neighbour}; the value/source/reference triples are broken`
        );
      }
    }
  }

  return resolved;
}

/**
 * The band the median of each column's measured values must fall into.
 *
 * The second net, and the more valuable one. A header match cannot catch a
 * three-column shift that puts the `Datenherkunft` code — a small integer or a
 * letter — into the value slot: `parseMeasured` turns that into null or into a
 * plausible small number, and the corruption is silent. A median outside its
 * band is not.
 *
 * Bands are wide on purpose. They are a smoke alarm, not an assertion about
 * German nutrition; the point is to separate "milligrams of calcium" from "a
 * provenance code", not to pin a distribution.
 */
export const PLAUSIBLE_MEDIAN: Partial<Record<BlsKey, [number, number]>> = {
  kcal: [20, 400],
  protein: [0.5, 25],
  fat: [0.2, 30],
  carbs: [0.5, 60],
  sodium: [5, 800],
  calcium: [5, 300],
  magnesium: [3, 120],
  potassium: [40, 600],
  iron: [0.1, 5],
  zinc: [0.05, 5],
  phosphorus: [10, 400],
  vitC: [0, 30],
  vitD: [0, 3],
  vitE: [0, 5],
  vitA: [0, 200],
  folate: [0, 60],
  vitB12: [0, 3],
  iodine: [0, 20],
};

/** Column medians that fall outside their band, as human-readable lines. */
export function checkPlausibility(
  values: Partial<Record<BlsKey, number[]>>
): string[] {
  const problems: string[] = [];
  for (const [key, band] of Object.entries(PLAUSIBLE_MEDIAN) as [
    BlsKey,
    [number, number],
  ][]) {
    const measured = (values[key] ?? []).filter((value) => Number.isFinite(value));
    if (measured.length === 0) {
      problems.push(`${key}: no measured value at all — wrong column?`);
      continue;
    }
    const sorted = [...measured].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    const median =
      sorted.length % 2 === 1
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
    if (median < band[0] || median > band[1]) {
      problems.push(
        `${key}: median ${median} is outside the plausible band ${band[0]}..${band[1]} — likely the wrong column`
      );
    }
  }
  return problems;
}

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
  // Micronutrients, in the order of NUTRIENT_META's groups.
  'fiber_soluble_100',
  'mufa_100',
  'pufa_100',
  'omega6_100',
  'linoleic_100',
  'ala_100',
  'vit_a_100',
  'vit_d_100',
  'vit_e_100',
  'vit_k_100',
  'vit_c_100',
  'vit_b1_100',
  'vit_b2_100',
  'niacin_eq_100',
  'vit_b6_100',
  'folate_100',
  'vit_b12_100',
  'calcium_100',
  'magnesium_100',
  'iron_100',
  'zinc_100',
  'iodine_100',
  'potassium_100',
  'phosphorus_100',
  'sodium_100',
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
export function rowToBls(
  cells: (string | undefined)[],
  columns: Record<BlsKey, number>
): BlsRow | null {
  const code = (cells[columns.code] ?? '').trim();
  const name = (cells[columns.name] ?? '').trim();
  if (code === '' || name === '') return null;

  const at = (key: BlsKey) => parseMeasured(cells[columns[key]]);

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

  const g = (key: BlsKey) => formatNumber(at(key), 3);

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
    /*
     * Micronutrients at scale 3 throughout, in their BLS-native units.
     * Deliberately NOT normalised: `select vit_d_100 from food_catalog` should
     * print a number that can be checked against a package label, and
     * `src/lib/nutrients.ts` declares the unit once for everything downstream.
     */
    fiber_soluble_100: g('fiberSoluble'),
    mufa_100: g('mufa'),
    pufa_100: g('pufa'),
    omega6_100: g('omega6'),
    linoleic_100: g('linoleic'),
    ala_100: g('ala'),
    vit_a_100: g('vitA'),
    vit_d_100: g('vitD'),
    vit_e_100: g('vitE'),
    vit_k_100: g('vitK'),
    vit_c_100: g('vitC'),
    vit_b1_100: g('vitB1'),
    vit_b2_100: g('vitB2'),
    niacin_eq_100: g('niacinEq'),
    vit_b6_100: g('vitB6'),
    folate_100: g('folate'),
    vit_b12_100: g('vitB12'),
    calcium_100: g('calcium'),
    magnesium_100: g('magnesium'),
    iron_100: g('iron'),
    zinc_100: g('zinc'),
    iodine_100: g('iodine'),
    potassium_100: g('potassium'),
    phosphorus_100: g('phosphorus'),
    sodium_100: g('sodium'),
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
  let columns: Record<BlsKey, number> | null = null;
  let skipped = 0;
  // Collected per column so the medians can be sanity-checked at the end.
  const measured: Partial<Record<BlsKey, number[]>> = {};
  const emptyCells: Partial<Record<BlsKey, number>> = {};

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

      if (columns === null) {
        columns = resolveColumns(cells);
        console.log('resolved columns:');
        for (const key of BLS_KEYS) {
          const expected = BLS_NUTRIENTS[key].expectedIndex;
          console.log(
            `  ${key.padEnd(14)} ${String(columns[key]).padStart(4)}` +
              (expected === null ? '   (new — paste back into BLS_NUTRIENTS)' : '')
          );
        }
        continue;
      }

      const row = rowToBls(cells, columns);
      if (row === null) {
        skipped += 1;
        continue;
      }
      for (const key of BLS_KEYS) {
        if (key === 'code' || key === 'name') continue;
        const value = parseMeasured(cells[columns[key]]);
        if (value === null) {
          emptyCells[key] = (emptyCells[key] ?? 0) + 1;
          continue;
        }
        (measured[key] ??= []).push(value);
      }
      lines.push(toCsvLine(row));
    }
  }

  const rowCount = lines.length - 1;

  /*
   * The plausibility net. A header match cannot see a three-column shift that
   * puts a provenance code in the value slot; a median outside its band can.
   */
  const problems = checkPlausibility(measured);
  if (problems.length > 0) {
    console.error('implausible column medians:');
    for (const line of problems) console.error(`  ${line}`);
    process.exit(1);
  }

  // Coverage per column. These numbers are the empirical basis for the
  // per-nutrient coverage rule in services/nutrition/coverage.ts, and they
  // belong in db:check as lower bounds.
  console.log('measured share per column:');
  for (const key of BLS_KEYS) {
    if (key === 'code' || key === 'name') continue;
    const empty = emptyCells[key] ?? 0;
    const share = rowCount === 0 ? 0 : 1 - empty / rowCount;
    console.log(`  ${key.padEnd(14)} ${(share * 100).toFixed(1)} %`);
  }

  const csv = lines.join('\n') + '\n';
  // Defensive: no BLS name contains these today, and a template literal that
  // silently swallowed one would be a very quiet corruption.
  if (/[`\\]|\$\{/.test(csv)) {
    throw new Error('data contains a backtick, backslash or ${ — escape it');
  }

  await writeFile(outputPath, module_(csv), 'utf8');
  console.log(
    `wrote ${rowCount} foods to ${outputPath}` +
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
