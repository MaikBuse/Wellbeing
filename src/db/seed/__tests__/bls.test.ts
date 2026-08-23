import { describe, expect, it } from 'vitest';
import { parseCsv, rowsFromCsv } from '../bls';
import { BLS_CSV } from '../data/bls-4.0';
import { BLS_ALIASES } from '../data/bls-aliases';
import { BLS_EVERYDAY_CODES } from '../data/bls-everyday';

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
   * Spot values from the December 2025 release, chosen because they are
   * checkable against any nutrition table: whole milk is 117 mg calcium and
   * 153.5 mg potassium per 100 g. If a column ever shifts, these move with it.
   */
  it('carries the values a real milk row has', () => {
    const milk = rows.find((r) => r.blsCode === 'M111300')!;
    expect(milk.calcium100).toBe(117);
    expect(milk.potassium100).toBe(153.5);
    expect(milk.phosphorus100).toBe(93);
    expect(milk.iodine100).toBe(14);
    expect(milk.vitB12100).toBe(0.37);
  });

  /*
   * Sodium stays as sodium AND becomes salt. The salt column is a derived
   * convenience for a package label; the element column is the measurement, and
   * the two have to agree — 34.9 mg * 2.5 / 1000.
   */
  it('keeps sodium in milligrams alongside the derived salt figure', () => {
    const milk = rows.find((r) => r.blsCode === 'M111300')!;
    expect(milk.sodium100).toBe(34.9);
    expect(milk.salt100).toBeCloseTo(0.087, 3);
  });

  /*
   * The equivalents, not the single forms. D-A-CH states retinol equivalents
   * and niacin equivalents, and reading RETOL or NIA instead gives plausible
   * but systematically low numbers that no plausibility band would catch.
   */
  it('reads the equivalent columns where D-A-CH uses equivalents', () => {
    const milk = rows.find((r) => r.blsCode === 'M111300')!;
    // VITA (RE) is 25 µg for whole milk; RETOL alone would be lower.
    expect(milk.vitA100).toBe(25);
    // NIAEQ counts the tryptophan contribution, NIA alone would be near zero.
    expect(milk.niacinEq100).toBe(1.273);
  });

  /*
   * Still the contract that matters most: an unmeasured micronutrient is null.
   * Soluble fibre is measured for well under half the catalogue, so it is the
   * column where this is not hypothetical.
   */
  it('reads an unmeasured micronutrient as null, never as 0', () => {
    const measured = rows.filter((r) => r.fiberSoluble100 !== null).length;
    expect(measured).toBeGreaterThan(0);
    expect(measured).toBeLessThan(rows.length);
    for (const row of rows) {
      const value = row.fiberSoluble100;
      expect(value === null || (value !== undefined && value >= 0)).toBe(true);
    }
  });

  it('distinguishes a measured zero from an unmeasured value', () => {
    // Whole milk has a MEASURED zero for vitamin D — German milk is not
    // fortified — which is a different statement from "nobody looked".
    const milk = rows.find((r) => r.blsCode === 'M111300')!;
    expect(milk.vitD100).toBe(0);
  });

  it('maps every column of a synthetic row', () => {
    const csv =
      'bls_code,name_de,group_key,calcium_100,vit_d_100,sodium_100\n' +
      'X000001,Testeintrag,X,120,0.045,\n';
    const [row] = rowsFromCsv(csv);
    expect(row.calcium100).toBe(120);
    expect(row.vitD100).toBe(0.045);
    expect(row.sodium100).toBeNull();
  });
});
