/**
 * Everyday words that German compounds hide, per BLS code.
 *
 * The ranking in queries/search-rank.ts is structural: it knows that a word can
 * be the term, start with it, or end with it — and that a word ending in the
 * term is a compound head, so "Hühner|ei" is an egg while "Weißw|ein" is not.
 * That is what fixes most of the search.
 *
 * It cannot fix "Ei". No BLS name contains the word "Ei" on its own; the entry
 * is called `Hühnerei roh`. Structure gets the egg into the results, but the
 * plainest possible term for the plainest possible food should be the first
 * hit, and only a curated list can say so.
 *
 * Same contract as bls-everyday.ts, for the same reasons: codes and not names,
 * because a name is not stable across BLS releases and a typo in one would fail
 * silently (`db:check` asserts every code resolves). It is a ranking hint and
 * nothing more — everything unlisted stays searchable and reachable. Adding a
 * word needs a re-seed, not a migration, so this is a list to tune rather than
 * to get right.
 *
 * Only add a word the structural ranking gets wrong. Every entry here is a
 * standing exception, and the cheapest search to reason about is the one with
 * the fewest of them.
 */
export const BLS_ALIASES: readonly { code: string; terms: string }[] = [
  // The BLS prefixes the plain food and the bare head word loses to a dish
  // that happens to start with it: "quark" found `Quark-Plunder` before
  // `Speisequark`, "zwiebel" found `Zwiebelkuchen` before `Speisezwiebel`.
  { code: 'E111100', terms: 'ei eier' }, // Hühnerei roh
  { code: 'E111132', terms: 'ei eier' }, // Hühnerei gekocht
  { code: 'M713100', terms: 'quark' }, // Speisequark Magerstufe, Magerquark
  { code: 'G480100', terms: 'zwiebel zwiebeln' }, // Speisezwiebel roh
  { code: 'R114000', terms: 'salz' }, // Speisesalz jodiert/Jodsalz
  { code: 'M173800', terms: 'sahne schlagsahne' }, // Schlagsahne mind. 30 % Fett
  { code: 'M400600', terms: 'käse' }, // Schnittkäse mind. 45 % Fett i. Tr.
  { code: 'B251000', terms: 'brot' }, // Weizenmischbrot
  { code: 'G105100', terms: 'salat' }, // Kopfsalat roh
  { code: 'G543100', terms: 'paprika' }, // Gemüsepaprika rot, roh

  // The word is there, but a word too late to outrank a dish that opens with
  // it: "mehl" found `Mehlmischung` before `Weizen Mehl`.
  { code: 'C214100', terms: 'mehl' }, // Weizen Mehl, Type 405
  { code: 'U010100', terms: 'hack hackfleisch' }, // Rind Hackfleisch, roh
  { code: 'U020100', terms: 'hack hackfleisch' }, // Schwein Hackfleisch, roh

  // The BLS name and the everyday name are simply different words.
  { code: 'E401000', terms: 'nudel nudeln' }, // Teigwaren eifrei, roh
  { code: 'E401032', terms: 'nudel nudeln' }, // Teigwaren eifrei, gekocht
  { code: 'G312100', terms: 'brokkoli' }, // Broccoli roh
  { code: 'G312132', terms: 'brokkoli' }, // Broccoli gekocht
  { code: 'N110000', terms: 'wasser' }, // Trinkwasser
  { code: 'P163000', terms: 'bier' }, // Pilsner Bier

  // Generic terms the BLS never uses on its own: it has no "Wurst", no "Tee"
  // and no "Essig", only kinds of each. The everyday kinds all get the word, so
  // typing it offers the shortlist instead of a Wurstsalat.
  { code: 'W140000', terms: 'wurst' }, // Salami
  { code: 'W211200', terms: 'wurst' }, // Wiener Würstchen
  { code: 'W222100', terms: 'wurst' }, // Bratwurst mittelgrob
  { code: 'W327000', terms: 'wurst' }, // Leberwurst einfach
  { code: 'W331000', terms: 'wurst' }, // Mettwurst gekocht
  { code: 'W424032', terms: 'schinken' }, // Schwein Kochschinken
  { code: 'N610100', terms: 'tee' }, // Grüntee (Getränk)
  { code: 'N630000', terms: 'tee' }, // Schwarztee (Getränk)
  { code: 'N720100', terms: 'tee' }, // Kräutertee (Getränk)
  { code: 'R121000', terms: 'essig' }, // Weinessig
  { code: 'R123100', terms: 'essig' }, // Apfelessig
  { code: 'C512000', terms: 'müsli' }, // Müsli Basismischung, ungesüßt
  { code: 'M820100', terms: 'frischkäse' }, // Frischkäsezubereitung Natur
];
