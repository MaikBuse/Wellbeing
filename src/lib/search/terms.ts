/**
 * Turning what someone typed into search tokens.
 *
 * Everything here is pure string work. The folding and squashing that both
 * sides of a comparison need lives in SQL (src/db/search-expr.ts) precisely so
 * that it is not also here, half-agreeing.
 */

/** More words than this in a food name is a paste, not a search. */
const MAX_TOKENS = 6;

/** Long enough for `Trockenbeerenauslese`, short enough to bound the scan. */
const MAX_TOKEN_LENGTH = 40;

/**
 * The shortest term that is allowed to search at all.
 *
 * One character matches thousands of the 7140 BLS rows and ranks them on
 * nothing, so it is not a search — it is a full-table read with a limit. Both
 * call sites guarded this separately before; now they ask here.
 */
export const MIN_TERM_LENGTH = 2;

/**
 * Whitespace-separated words, capped. Order is kept but carries no meaning:
 * every token has to match somewhere, so "apfel roh" and "roh apfel" find the
 * same rows — which the single-substring search they replace could not.
 */
export function searchTokens(input: string): string[] {
  return input
    .split(/\s+/)
    .map((token) => token.trim().slice(0, MAX_TOKEN_LENGTH))
    .filter((token) => token.length > 0)
    .slice(0, MAX_TOKENS);
}

/**
 * Escapes the LIKE metacharacters, backslash first.
 *
 * Without this a typed `%` is a wildcard and matches the whole table, and `_`
 * matches any single character — the old search had neither escape. Note that
 * `%` is not exotic in this data: 3 of every 4 dairy names carry one
 * ("mind. 50 % Fett i. Tr."), so `%` has to search for a literal percent sign.
 *
 * Only the folded axis needs this. The squashed axis drops everything outside
 * a-z0-9 and so cannot carry a metacharacter in the first place.
 */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Is this term worth a query at all? */
export function isSearchable(input: string): boolean {
  return input.trim().length >= MIN_TERM_LENGTH;
}
