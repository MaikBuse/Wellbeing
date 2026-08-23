import { describe, expect, it } from 'vitest';
import { escapeLike, isSearchable, searchTokens } from '../terms';

describe('searchTokens', () => {
  it('splits on whitespace', () => {
    expect(searchTokens('hafer flocken')).toEqual(['hafer', 'flocken']);
  });

  it('collapses runs of whitespace instead of emitting empty tokens', () => {
    // An empty token would match every row and make the AND meaningless.
    expect(searchTokens('  milch   1,5  ')).toEqual(['milch', '1,5']);
  });

  it('is empty for a blank input', () => {
    expect(searchTokens('   ')).toEqual([]);
  });

  it('caps the number of tokens', () => {
    expect(searchTokens('a b c d e f g h')).toHaveLength(6);
  });

  it('caps the length of a single token', () => {
    expect(searchTokens('x'.repeat(200))[0]).toHaveLength(40);
  });

  it('leaves umlauts alone — folding is SQL’s job', () => {
    expect(searchTokens('Möhre')).toEqual(['Möhre']);
  });
});

describe('escapeLike', () => {
  it('escapes the percent sign so it searches for a percent sign', () => {
    // "Vollmilch frisch, 3,5 % Fett" — the data is full of literal percents.
    expect(escapeLike('50 %')).toBe('50 \\%');
  });

  it('escapes the single-character wildcard', () => {
    expect(escapeLike('a_b')).toBe('a\\_b');
  });

  it('escapes the backslash itself, and only once', () => {
    expect(escapeLike('a\\b')).toBe('a\\\\b');
  });

  it('leaves an ordinary term untouched', () => {
    expect(escapeLike('Karotte/Möhre')).toBe('Karotte/Möhre');
  });
});

describe('isSearchable', () => {
  it('rejects one character', () => {
    expect(isSearchable('a')).toBe(false);
    expect(isSearchable(' a ')).toBe(false);
  });

  it('accepts two', () => {
    expect(isSearchable('ei')).toBe(true);
  });
});
