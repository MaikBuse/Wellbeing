import { describe, expect, it } from 'vitest';
import {
  blsGroupKey,
  columnIndexFromRef,
  csvEscape,
  decodeXmlEntities,
  formatNumber,
  parseMeasured,
  parseSharedStrings,
  parseSheetRow,
  rowToBls,
  saltFromSodiumMg,
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

describe('rowToBls', () => {
  function cells(overrides: Record<number, string>) {
    const row: (string | undefined)[] = [];
    row[0] = 'M111300';
    row[1] = 'Vollmilch frisch, 3,5 % Fett';
    for (const [index, value] of Object.entries(overrides)) {
      row[Number(index)] = value;
    }
    return row;
  }

  it('maps the columns a real milk row carries', () => {
    const row = rowToBls(cells({ 6: '62', 123: '100', 216: '3.89' }));
    expect(row).toMatchObject({
      bls_code: 'M111300',
      group_key: 'M',
      kcal_100: '62',
      lactose_100: '3.89',
      salt_100: '0.25',
    });
  });

  it('sums the polyols but keeps all-unmeasured as unmeasured', () => {
    expect(rowToBls(cells({ 189: '0.4', 192: '0.1' }))?.sorbitol_100).toBe('0.5');
    expect(rowToBls(cells({}))?.sorbitol_100).toBe('');
  });

  it('sums EPA and DHA when only one of them is measured', () => {
    expect(rowToBls(cells({ 321: '0.5' }))?.epa_dha_100).toBe('0.5');
  });

  it('skips a row without a code or a name', () => {
    expect(rowToBls([])).toBeNull();
    expect(rowToBls(['C131000'])).toBeNull();
  });
});
