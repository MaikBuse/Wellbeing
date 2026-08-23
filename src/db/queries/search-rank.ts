/**
 * The ranking behind both food searches.
 *
 * The old ordering put `is_everyday` first and the character position of the
 * match second, which is how typing "Ei" answered `Weißwein trocken`: every one
 * of the 230 everyday rows containing the letters "ei" anywhere — `Weinessig`,
 * `Leinöl`, `Schwein…` — outranked any better match, and among those
 * "w-e-i-ßwein" has its hit at character 2 while "Hühner-e-i" has it at 7.
 * `ILIKE '%ei%'` matches 2474 of the 7140 catalog rows; nothing in that query
 * knew where a word began or ended.
 *
 * So the score is wordwise. Lower is better:
 *
 *     score = wordIndex * 5 + matchKind
 *
 * `matchKind` is how the word is hit: 1 the word IS the term, 2 the word starts
 * with it, 3 the word ENDS with it, 4 the term sits inside the word. Kind 3 is
 * the rule that answers the original complaint — in German the head of a
 * compound is its last element, so a word ending in "ei" is an egg and
 * "Weißwein" (which ends in "ein", not "ei") is not.
 *
 * `wordIndex` is the earliest word that matches, and it outweighs the kind on
 * purpose: `Vollmilch` (word 0, compound head) should beat `Apfelreis mit
 * Milch` (word 2, exact word), because the second is a dish that mentions milk.
 * It replaces the old `strpos`, counting words instead of characters.
 *
 * Two things sit outside the ladder:
 *
 * "/" separates synonyms, not words. The BLS writes `Karotte/Möhre, roh`,
 * `Batate/Süßkartoffel, roh`, `Rosine/Sultanine (…)`. Each side is scored as
 * its own name and the best wins; without that, "möhre" ranked
 * `Möhren-Nuss-Kuchen` (word 0) above `Karotte/Möhre, roh` (word 1).
 *
 * An exact hit short-circuits to -1: the squashed name equals the squashed term
 * (`Hafer Flocken` for "haferflocken"), or a curated alias word matches
 * (seed/data/bls-aliases.ts). Nothing outranks having typed the thing.
 *
 * Ties break on `is_everyday`, then the shortest name, then alphabetically —
 * the everyday shortlist keeps its say, it just no longer overrules relevance.
 *
 * Two limits worth knowing. Multi-token scores are summed, so a name that needs
 * two words to satisfy two tokens scores worse than one compound word that
 * satisfies both — and the exact-hit short-circuit reads the tokens in the
 * order they were typed, because "haferflocken" is a word and "flockenhafer" is
 * not. Together that means "hafer flocken" finds `Hafer Flocken` and "flocken
 * hafer" does not. Word order is otherwise irrelevant: "roh apfel" and "apfel
 * roh" return the same rows in the same order.
 */
import { sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { foldExpr, squashExpr, wordsExpr } from '../search-expr';
import { escapeLike } from '@/lib/search/terms';

/** Score for a token that matched only via the squashed axis, i.e. across a
 * word boundary. Worse than any wordwise hit (the worst of those is 4*5+4). */
const CROSS_WORD = 25;

/** What the score short-circuits to on an exact or alias hit. */
const EXACT = -1;

type Target = {
  /** Generated column: the name (plus brand, for the library), folded. */
  folded: PgColumn;
  /** Generated column: the same, with everything but a-z0-9 removed. */
  squashed: PgColumn;
  /** Curated extra search words. The library has none. */
  alias?: PgColumn;
};

/**
 * The folded term, escaped so a typed `%` or `_` is not a wildcard. No ESCAPE
 * clause is needed alongside it: backslash is LIKE's default escape.
 */
const foldedTerm = (token: string) => foldExpr(sql`${escapeLike(token)}`);

/** The squashed term. Unescaped on purpose — squashing drops metacharacters. */
const squashedTerm = (token: string) => squashExpr(sql`${token}`);

/** The alias words of a row, as a text[]; an empty array when there are none. */
const aliasWords = (target: Target) =>
  target.alias
    ? wordsExpr(foldExpr(sql`coalesce(${target.alias}, '')`))
    : sql`'{}'::text[]`;

/**
 * The wordwise score of one token: the best score over every word of every
 * "/"-separated variant, or the cross-word penalty when the token only showed
 * up on the squashed axis.
 *
 * `WITH ORDINALITY` numbers the words from 1, so the first word contributes 5.
 */
function tokenScore(target: Target, token: string): SQL {
  const term = foldedTerm(token);
  return sql`coalesce((
    select min(
      w.ord * 5 + case
        when w.word = ${term} then 1
        when w.word like ${term} || '%' then 2
        when w.word like '%' || ${term} then 3
        else 4
      end
    )
    from unnest(string_to_array(${target.folded}, '/')) as variant,
         unnest(${wordsExpr(sql`variant`)}) with ordinality as w(word, ord)
    where w.word like '%' || ${term} || '%'
  ), ${CROSS_WORD})`;
}

/**
 * A row matches a token on either axis, or by carrying it as an alias word.
 *
 * The squashed axis is guarded on the squashed term being non-empty. A token of
 * nothing but punctuation — "%%" — squashes to '' and `like '%' || '' || '%'`
 * is `like '%%'`, which is every row in the table. The guard is in SQL and not
 * in TypeScript so that it cannot disagree with `squashExpr` about what counts
 * as empty.
 */
function tokenMatches(target: Target, token: string): SQL {
  const squashed = squashedTerm(token);
  return sql`(
    ${target.folded} like '%' || ${foldedTerm(token)} || '%'
    or (${squashed} <> '' and ${target.squashed} like '%' || ${squashed} || '%')
    or ${foldedTerm(token)} = any(${aliasWords(target)})
  )`;
}

/** Typing the whole thing: squashed-equal, or an exact alias word. */
function isExact(target: Target, tokens: string[], whole: string): SQL {
  const squashed = squashedTerm(whole);
  return sql`(
    (${squashed} <> '' and ${target.squashed} = ${squashed})
    or ${tokens.length === 1 ? sql`${foldedTerm(tokens[0]!)} = any(${aliasWords(target)})` : sql`false`}
  )`;
}

/**
 * Every token has to match — so "milch laktosefrei" narrows instead of
 * widening, and word order carries no meaning.
 */
export function searchWhere(target: Target, tokens: string[]): SQL {
  return sql.join(
    tokens.map((token) => tokenMatches(target, token)),
    sql` and `
  );
}

/** The summed score, or -1 for an exact hit. Lower sorts first. */
export function searchScore(
  target: Target,
  tokens: string[],
  whole: string
): SQL<number> {
  const summed = sql.join(
    tokens.map((token) => tokenScore(target, token)),
    sql` + `
  );
  return sql<number>`case when ${isExact(target, tokens, whole)} then ${EXACT} else (${summed}) end`;
}
