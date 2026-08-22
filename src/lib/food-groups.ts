/**
 * BLS food groups, from the leading letter(s) of the BLS code.
 *
 * `food_catalog.group_key` holds that letter. It is a property of the catalogue
 * rather than of a keyword rule, which makes it a more trustworthy answer to
 * "what did I actually eat" than the descriptive `group` tags — those depend on
 * a name matching a pattern.
 *
 * Nine groups is past the six-slot cap of the chart palette, so the smallest are
 * folded into "Sonstiges". Never a seventh generated hue: a generated colour is
 * indistinguishable from an existing slot under simulated colour blindness.
 */
export const BLS_GROUP_LABELS: Record<string, string> = {
  B: 'Brot & Backwares',
  C: 'Getreide',
  D: 'Kartoffeln & Stärke',
  E: 'Ei & Teigwaren',
  F: 'Obst',
  G: 'Gemüse',
  H: 'Nüsse & Samen',
  K: 'Gemüseerzeugnisse',
  M: 'Milchprodukte',
  N: 'Getränke',
  P: 'Alkoholische Getränke',
  Q: 'Öle & Fette',
  R: 'Zucker & Süßwaren',
  S: 'Süßwaren',
  T: 'Fisch & Meeresfrüchte',
  U: 'Fleisch',
  W: 'Wurstwaren',
  X: 'Fertiggerichte',
  Y: 'Menükomponenten',
  Z: 'Würzmittel',
};

export const UNKNOWN_GROUP_LABEL = 'Ohne Katalogeintrag';

export function blsGroupLabel(groupKey: string | null): string {
  if (groupKey === null) return UNKNOWN_GROUP_LABEL;
  return BLS_GROUP_LABELS[groupKey.charAt(0).toUpperCase()] ?? UNKNOWN_GROUP_LABEL;
}

/**
 * Fold a label→value map down to `keep` entries plus "Sonstiges".
 *
 * The tail is summed, not dropped: a chart that quietly omits a fifth of the
 * food would read as complete when it is not.
 */
export function foldToTopGroups(
  totals: Map<string, number>,
  keep: number
): { label: string; value: number }[] {
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const head = sorted.slice(0, keep);
  const tail = sorted.slice(keep);
  const out = head.map(([label, value]) => ({ label, value }));
  if (tail.length > 0) {
    out.push({
      label: 'Sonstiges',
      value: tail.reduce((sum, [, value]) => sum + value, 0),
    });
  }
  return out;
}
