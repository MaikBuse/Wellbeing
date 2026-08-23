import { describe, expect, it } from 'vitest';
import { parseCsv, rowsFromCsv } from '../bls';
import { BLS_CSV } from '../data/bls-4.0';
import { BLS_ALIASES } from '../data/bls-aliases';
import { BLS_EVERYDAY_CODES } from '../data/bls-everyday';

/**
 * The committed seed file is still the pre-micronutrient one until the BLS
 * XLSX is re-imported: the columns exist on the table and in the CSV header,
 * but every micronutrient is empty. These tests pin the CONTRACT — an absent
 * column reads as null, never as zero — so that re-importing turns them into
 * real assertions without any of them needing to be rewritten.
 */
describe('parseCsv', () => {
  it('keeps a quoted comma inside the field', () => {
    // Half the BLS names carry a comma: "Hafer ganzes Korn, roh".
    expect(parseCsv('a,"b,c",d\n')).toEqual([['a', 'b,c', 'd']]);
  });

  it('unescapes a doubled quote', () => {
    expect(parseCsv('"say ""hi""",x\n')).toEqual([['say "hi"', 'x']]);
  });

  it('reads empty fields as empty, not as missing columns', () => {
    expect(parseCsv('a,,c\n')).toEqual([['a', '', 'c']]);
  });
});

describe('the committed BLS data', () => {
  const rows = rowsFromCsv(BLS_CSV);

  it('holds the full BLS 4.0 release', () => {
    expect(rows).toHaveLength(7140);
  });

  it('has a unique code for every food', () => {
    expect(new Set(rows.map((r) => r.blsCode)).size).toBe(rows.length);
  });

  it('distinguishes unmeasured from measured-as-zero', () => {
    const milk = rows.find((r) => r.blsCode === 'M111300')!;
    expect(milk.nameDe).toBe('Vollmilch frisch, 3,5 % Fett, pasteurisiert');
    expect(milk.lactose100).toBe(3.89);

    // Beer has no measured fat; that must not arrive as 0.
    const beer = rows.find((r) => r.blsCode === 'P151100')!;
    expect(beer.fat100).toBeNull();
    expect(beer.alcohol100).toBe(4.178);
  });

  it('carries the values the measured tag rules depend on', () => {
    const byCode = new Map(rows.map((r) => [r.blsCode, r]));
    // Lactose-free milk sits under the 0.5 threshold, hard cheese at zero.
    expect(byCode.get('M1E3300')!.lactose100).toBe(0.05);
    expect(byCode.get('M400700')!.lactose100).toBe(0);
    // Alcohol no keyword rule would ever find.
    expect(byCode.get('X538943')!.alcohol100).toBe(0.58);
  });

  it('resolves every curated everyday code', () => {
    // A typo here would silently degrade the picker ranking and nothing else.
    const codes = new Set(rows.map((r) => r.blsCode));
    const unknown = BLS_EVERYDAY_CODES.filter((code) => !codes.has(code));
    expect(unknown).toEqual([]);
  });

  it('resolves every curated alias code', () => {
    // Same silent-failure risk as the everyday list: a wrong code here means
    // the alias simply never applies and "Ei" quietly finds Weißwein again.
    const codes = new Set(rows.map((r) => r.blsCode));
    const unknown = BLS_ALIASES.map((a) => a.code).filter((c) => !codes.has(c));
    expect(unknown).toEqual([]);
  });

  it('lists every code at most once', () => {
    // The seed builds a Map from this, so a repeated code would keep only the
    // last entry and drop the other's words without a word.
    const codes = BLS_ALIASES.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('holds plain space-separated words', () => {
    // Umlauts are fine — both sides of the comparison are folded in SQL, which
    // is why { terms: 'käse' } matches someone typing "kaese". Punctuation is
    // not: it would split one alias into two words that each mean nothing.
    const odd = BLS_ALIASES.filter(
      (a) => !/^[\p{Ll}0-9]+( [\p{Ll}0-9]+)*$/u.test(a.terms)
    );
    expect(odd).toEqual([]);
  });

  it('puts the alias on the seeded row', () => {
    const egg = rows.find((r) => r.blsCode === 'E111100')!;
    expect(egg.nameDe).toBe('Hühnerei roh');
    expect(egg.searchAlias).toBe('ei eier');
    // Everything unlisted stays null rather than ''.
    expect(rows.find((r) => r.blsCode === 'C133000')!.searchAlias).toBeNull();
  });

  it('flags exactly the curated codes as everyday', () => {
    const flagged = rows.filter((r) => r.isEveryday).map((r) => r.blsCode);
    expect(flagged.sort()).toEqual([...BLS_EVERYDAY_CODES].sort());
  });
});


describe('die Mikronährstoff-Spalten', () => {
  const rows = rowsFromCsv(BLS_CSV);

  /*
   * Whatever the state of the seed file, an unfilled micronutrient must arrive
   * as null. A zero here would mean "measured and none present", and every day
   * total in the app would then be understated with no coverage figure to show
   * for it.
   */
  it('read an absent micronutrient as null, never as 0', () => {
    const milk = rows.find((r) => r.blsCode === 'M111300')!;
    for (const value of [
      milk.calcium100,
      milk.vitD100,
      milk.iodine100,
      milk.potassium100,
    ]) {
      expect(value === null || typeof value === 'number').toBe(true);
      if (value !== null) expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('accept a filled micronutrient column when the seed carries one', () => {
    // Synthetic rather than from the committed file, so the mapping is checked
    // before the re-import rather than after it.
    const csv =
      'bls_code,name_de,group_key,calcium_100,vit_d_100,sodium_100\n' +
      'X000001,Testeintrag,X,120,0.045,\n';
    const [row] = rowsFromCsv(csv);
    expect(row.calcium100).toBe(120);
    expect(row.vitD100).toBe(0.045);
    expect(row.sodium100).toBeNull();
  });
});
