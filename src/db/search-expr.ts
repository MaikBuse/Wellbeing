/**
 * The text normalisation behind the food search, as SQL.
 *
 * It lives here — not in the queries and not in the schema — because the same
 * two expressions have to describe both sides of every comparison: the stored
 * generated columns on `food` and `food_catalog` (schema/food.ts) and the term
 * the person typed (queries/search-rank.ts). A second, hand-copied definition
 * that drifts by one character would silently stop matching, so there is one.
 *
 * Deliberately no TypeScript twin. Folding the term in JS and the column in SQL
 * is the same trap with extra steps.
 *
 * On the column side these become STORED generated columns, because the cost
 * was measured: folding all 7140 catalog names at query time takes ~37 ms and
 * splitting them into words another ~35 ms, and the picker fires a search
 * behind a 250 ms debounce on every keystroke. Stored, the query does a LIKE
 * over finished text and only splits the handful of rows that survive it.
 *
 * Which is also why these are plain inlined expressions and not a SQL
 * function: a generated column may not reference another generated column, and
 * a user-defined function would put the search normalisation into the
 * migration ordering.
 */
import { sql, type SQL } from 'drizzle-orm';

/**
 * lower plus the German digraphs. `ä→ae` and not `ä→a`, so that someone typing
 * "moehre" and someone typing "Möhre" land on the same string — with `ä→a` the
 * first would have to be spelled "mohre", and "sauerkraut" would fold to
 * "saurkraut" and stop matching itself.
 *
 * ß→ss is the one that makes "weisswein" find `Weißwein`, which today it does
 * not.
 *
 * Only the German set. Ä Ö Ü ß ä ö ü are the only non-ASCII letters in all 7140
 * BLS names, so nothing else would earn its `replace`. An accented loanword
 * typed into the library by hand ("Crème") therefore still needs its accent —
 * a real gap, but a different one.
 */
export const foldExpr = (x: SQL) =>
  sql`replace(replace(replace(replace(lower(${x}), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss')`;

/**
 * Everything but a-z0-9 removed, on top of the fold. This is the axis that maps
 * "haferflocken" onto `Hafer Flocken`: the BLS writes compounds apart and
 * nobody types them that way.
 *
 * It also disarms LIKE metacharacters by construction — a typed `%` or `_` is
 * simply not in a-z0-9 and disappears — which is why the squashed axis needs no
 * escaping while the folded one does (see `escapeLike`).
 */
export const squashExpr = (x: SQL) =>
  sql`regexp_replace(${foldExpr(x)}, '[^a-z0-9]', '', 'g')`;

/**
 * The folded text split into words, as a text[].
 *
 * Non-alphanumerics collapse to a single space before the split rather than
 * being used as the split pattern directly: `regexp_split_to_array` on a
 * leading separator yields an empty first element, and every word index after
 * it would be off by one — which is the number the ranking is built on.
 */
export const wordsExpr = (folded: SQL) =>
  sql`string_to_array(btrim(regexp_replace(${folded}, '[^a-z0-9]+', ' ', 'g')), ' ')`;
