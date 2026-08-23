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
