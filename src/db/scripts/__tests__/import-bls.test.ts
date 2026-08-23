import { describe, expect, it } from 'vitest';
import {
  BLS_KEYS,
  BLS_NUTRIENTS,
  blsGroupKey,
  checkPlausibility,
  columnIndexFromRef,
  csvEscape,
  decodeXmlEntities,
  formatNumber,
  parseMeasured,
  parseSharedStrings,
  parseSheetRow,
  resolveColumns,
  rowToBls,
  saltFromSodiumMg,
  type BlsKey,
} from '../import-bls';

describe('parseMeasured', () => {
  it('reads a plain number, including scientific notation', () => {
    expect(parseMeasured('3.89')).toBe(3.89);
    expect(parseMeasured('1.0999999999999999E-2')).toBeCloseTo(0.011, 6);
  });

  it('turns a below-detection sentinel into 0, not null', () => {
    // "measured, none detectable" must be allowed to withhold a trigger tag.
    expect(parseMeasured('<LOD')).toBe(0);
    expect(parseMeasured('<LOD or <LOQ')).toBe(0);
  });

  it('turns an unmeasured cell into null, not 0', () => {
    // The distinction is the whole contract with `bls_measured` rules.
    expect(parseMeasured('')).toBeNull();
    expect(parseMeasured('   ')).toBeNull();
    expect(parseMeasured(undefined)).toBeNull();
  });
});

describe('saltFromSodiumMg', () => {
  it('converts sodium in mg to salt in g', () => {
    expect(saltFromSodiumMg(1000)).toBeCloseTo(2.5, 6);
    expect(saltFromSodiumMg(0)).toBe(0);
  });

  it('keeps unmeasured unmeasured', () => {
    expect(saltFromSodiumMg(null)).toBeNull();
  });
});

describe('columnIndexFromRef', () => {
  it('decodes the spreadsheet column, not the position in the row', () => {
    expect(columnIndexFromRef('A2')).toBe(0);
    expect(columnIndexFromRef('Z1')).toBe(25);
    expect(columnIndexFromRef('AA1')).toBe(26);
    expect(columnIndexFromRef('GT2')).toBe(201);
  });
});

describe('parseSheetRow', () => {
  const shared = ['C131000', 'Hafer ganzes Korn, roh'];

  it('places cells by reference, so a skipped empty cell shifts nothing', () => {
    // xlsx omits empty cells: B is missing here, and D must still land at 3.
    const xml =
      '<row r="2"><c r="A2" t="s"><v>0</v></c><c r="C2" t="s"><v>1</v></c><c r="D2"><v>343</v></c></row>';
    const cells = parseSheetRow(xml, shared);
    expect(cells[0]).toBe('C131000');
    expect(cells[1]).toBeUndefined();
    expect(cells[2]).toBe('Hafer ganzes Korn, roh');
    expect(cells[3]).toBe('343');
  });

  it('reads a self-closing empty cell as absent', () => {
    const cells = parseSheetRow('<row r="2"><c r="A2"/><c r="B2"><v>7</v></c></row>', shared);
    expect(cells[0]).toBeUndefined();
    expect(cells[1]).toBe('7');
  });

  it('keeps the sentinel readable through XML escaping', () => {
    const cells = parseSheetRow(
      '<row r="2"><c r="A2" t="str"><v>&lt;LOD or &lt;LOQ</v></c></row>',
      shared
    );
    expect(parseMeasured(cells[0])).toBe(0);
  });
});

describe('parseSharedStrings', () => {
  it('joins the runs of one entry and decodes entities', () => {
    const xml =
      '<sst><si><t>Hafer</t></si><si><r><t>Milch </t></r><r><t>3,5 %</t></r></si>' +
      '<si><t>&lt;LOD &amp; co</t></si></sst>';
    expect(parseSharedStrings(xml)).toEqual([
      'Hafer',
      'Milch 3,5 %',
      '<LOD & co',
    ]);
  });
});

describe('decodeXmlEntities', () => {
  it('resolves &amp; last, so an escaped entity survives', () => {
    expect(decodeXmlEntities('&amp;lt;LOD')).toBe('&lt;LOD');
  });
});

describe('formatNumber and csvEscape', () => {
  it('writes dot decimals — a data file is not a form field', () => {
    expect(formatNumber(9.3000000000000007, 2)).toBe('9.3');
    expect(formatNumber(4.1784999999999997, 3)).toBe('4.178');
  });

  it('writes an unmeasured value as an empty field', () => {
    expect(formatNumber(null, 3)).toBe('');
  });

  it('never emits negative zero', () => {
    expect(formatNumber(-0.0001, 2)).toBe('0');
  });

  it('quotes the names that contain a comma', () => {
    expect(csvEscape('Hafer ganzes Korn, roh')).toBe('"Hafer ganzes Korn, roh"');
    expect(csvEscape('Hafer Flocken')).toBe('Hafer Flocken');
  });
});

describe('blsGroupKey', () => {
  it('is the leading letter of the code', () => {
    expect(blsGroupKey('C131000')).toBe('C');
    expect(blsGroupKey('M1E3300')).toBe('M');
  });
});

/**
 * A resolved column map for the tests.
 *
 * Built from the verified indices where there are any, and from an arbitrary
 * spare column above them where there are not — the point of these tests is the
 * mapping, not the layout of a release nobody has read here.
 */
const TEST_COLUMNS = (() => {
  const map = {} as Record<BlsKey, number>;
  let spare = 400;
  for (const key of BLS_KEYS) {
    const expected = BLS_NUTRIENTS[key].expectedIndex;
    map[key] = expected ?? (spare += 3);
  }
  return map;
})();

describe('resolveColumns', () => {
  /**
   * A header row with the real triple structure.
   *
   * Every nutrient owns three columns — value, `Datenherkunft`, `Referenz` —
   * and all three start with its code. A fixture that emitted only the value
   * column would be testing a file shape the BLS does not have.
   */
  function header(entries: Record<number, string>): (string | undefined)[] {
    const row: (string | undefined)[] = [];
    for (const key of BLS_KEYS) {
      const code = BLS_NUTRIENTS[key].prefix.trimEnd();
      const index = TEST_COLUMNS[key];
      row[index] = `${code} Bezeichnung [g/100g]`;
      if (key === 'code' || key === 'name') continue;
      row[index + 1] = `${code} Datenherkunft`;
      row[index + 2] = `${code} Referenz`;
    }
    for (const [index, value] of Object.entries(entries)) {
      row[Number(index)] = value;
    }
    return row;
  }

  it('resolves every nutrient from the header row', () => {
    const resolved = resolveColumns(header({}));
    expect(resolved.calcium).toBe(TEST_COLUMNS.calcium);
    expect(resolved.kcal).toBe(BLS_NUTRIENTS.kcal.expectedIndex);
  });

  it('throws when a prefix matches nothing', () => {
    const row = header({});
    row[TEST_COLUMNS.calcium] = 'etwas ganz anderes';
    expect(() => resolveColumns(row)).toThrow(/calcium/);
  });

  /*
   * The provenance columns carry the same code as the value column. Matching on
   * the code alone would make every nutrient ambiguous, so they are excluded by
   * NAME — never by position, because position is exactly what a shifted
   * release changes.
   */
  it('ignores the Datenherkunft and Referenz columns of the same code', () => {
    const resolved = resolveColumns(header({}));
    expect(resolved.calcium).toBe(TEST_COLUMNS.calcium);
    expect(resolved.kcal).toBe(BLS_NUTRIENTS.kcal.expectedIndex);
  });

  /*
   * And the failure a value-column match cannot see: if a release drops one of
   * the two companions, everything after it shifts by one and a provenance code
   * would be read as a measurement.
   */
  it('throws when a nutrient triple is incomplete', () => {
    const row = header({});
    // A foreign column where the Datenherkunft belongs. Had it kept the CA
    // code, the ambiguity check above would have caught it first — this is the
    // case where only the triple check can.
    row[TEST_COLUMNS.calcium + 1] = 'XYZ Fremdspalte [g/100g]';
    expect(() => resolveColumns(row)).toThrow(/triples are broken/);
  });

  /*
   * The real risk with short element codes: CA also starts CARTB, FOL starts
   * FOLFD, NIA starts NIAEQ, K starts KCAL. The trailing space in the prefix is
   * what keeps them apart, and this is the test that says so.
   */
  it('throws when a prefix is ambiguous rather than picking one', () => {
    const row = header({});
    row[500] = 'CA Calcium, zweites Vorkommen [mg/100g]';
    expect(() => resolveColumns(row)).toThrow(/ambiguous/);
  });

  it('does not confuse CA with CARTB or NIA with NIAEQ', () => {
    const row = header({});
    row[510] = 'CARTB Beta-Carotin [µg/100g]';
    row[513] = 'NIA Niacin [mg/100g]';
    const resolved = resolveColumns(row);
    expect(resolved.calcium).toBe(TEST_COLUMNS.calcium);
    expect(resolved.niacinEq).toBe(TEST_COLUMNS.niacinEq);
  });

  it('throws when a verified index has moved, naming both numbers', () => {
    const row = header({});
    row[BLS_NUTRIENTS.kcal.expectedIndex as number] = 'irgendwas';
    row[700] = 'ENERCC Energie (Kilokalorien) [kcal/100g]';
    expect(() => resolveColumns(row)).toThrow(/expected column 6 but found 700/);
  });
});

describe('checkPlausibility', () => {
  it('accepts medians inside their band', () => {
    const problems = checkPlausibility({
      calcium: [100, 120, 140],
      vitD: [0, 0.2, 1],
    }).join(' ');
    expect(problems).not.toMatch(/calcium/);
    expect(problems).not.toMatch(/vitD/);
  });

  /* A band key with nothing in it is a wrong column, not a quiet pass. */
  it('reports every band column that produced no value', () => {
    const problems = checkPlausibility({});
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((line) => line.includes('no measured'))).toBe(true);
  });

  /*
   * The failure a header match cannot see: every nutrient occupies three
   * columns, so a shift puts the Datenherkunft code — a small integer — into
   * the value slot. It parses fine and it is quietly wrong.
   */
  it('catches a column shifted onto its provenance code', () => {
    const provenanceCodes = Array.from({ length: 50 }, () => 2);
    const problems = checkPlausibility({ calcium: provenanceCodes });
    expect(problems.join(' ')).toMatch(/calcium/);
    expect(problems.join(' ')).toMatch(/plausible band/);
  });

  it('reports a column with no measured value at all', () => {
    expect(checkPlausibility({ calcium: [] }).join(' ')).toMatch(/no measured/);
  });
});

describe('rowToBls', () => {
  function cells(overrides: Record<number, string>) {
    const row: (string | undefined)[] = [];
    row[TEST_COLUMNS.code] = 'M111300';
    row[TEST_COLUMNS.name] = 'Vollmilch frisch, 3,5 % Fett';
    for (const [index, value] of Object.entries(overrides)) {
      row[Number(index)] = value;
    }
    return row;
  }

  it('maps the columns a real milk row carries', () => {
    const row = rowToBls(
      cells({
        [TEST_COLUMNS.kcal]: '62',
        [TEST_COLUMNS.sodium]: '100',
        [TEST_COLUMNS.lactose]: '3.89',
        [TEST_COLUMNS.calcium]: '120',
      }),
      TEST_COLUMNS
    );
    expect(row).toMatchObject({
      bls_code: 'M111300',
      group_key: 'M',
      kcal_100: '62',
      lactose_100: '3.89',
      salt_100: '0.25',
      calcium_100: '120',
    });
  });

  it('writes every micronutrient column, unmeasured ones as empty', () => {
    const row = rowToBls(cells({ [TEST_COLUMNS.vitD]: '0.045' }), TEST_COLUMNS);
    expect(row?.vit_d_100).toBe('0.045');
    expect(row?.calcium_100).toBe('');
    expect(row?.iodine_100).toBe('');
  });

  it('keeps the micronutrient units BLS-native', () => {
    // Sodium goes into salt AND stays as sodium in mg: the salt column is a
    // derived convenience, the element column is the measurement.
    const row = rowToBls(cells({ [TEST_COLUMNS.sodium]: '100' }), TEST_COLUMNS);
    expect(row?.salt_100).toBe('0.25');
    expect(row?.sodium_100).toBe('100');
  });

  it('sums the polyols but keeps all-unmeasured as unmeasured', () => {
    expect(
      rowToBls(
        cells({ [TEST_COLUMNS.sorbitol]: '0.4', [TEST_COLUMNS.xylitol]: '0.1' }),
        TEST_COLUMNS
      )?.sorbitol_100
    ).toBe('0.5');
    expect(rowToBls(cells({}), TEST_COLUMNS)?.sorbitol_100).toBe('');
  });

  it('sums EPA and DHA when only one of them is measured', () => {
    expect(
      rowToBls(cells({ [TEST_COLUMNS.epa]: '0.5' }), TEST_COLUMNS)?.epa_dha_100
    ).toBe('0.5');
  });

  it('skips a row without a code or a name', () => {
    expect(rowToBls([], TEST_COLUMNS)).toBeNull();
    expect(rowToBls(['C131000'], TEST_COLUMNS)).toBeNull();
  });
});
