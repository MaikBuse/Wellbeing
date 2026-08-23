/**
 * Household measures worth offering before anything has been typed.
 *
 * Deliberately not a table. `food_portion.label_de` is free text, and a fixed
 * vocabulary would mean a second place to maintain and a detour through settings
 * the first time someone needs „Riegel“. These are chips, not a whitelist: they
 * exist so that "Stück" is one tap and always spelled the same way in a catalog
 * that every account shares.
 */
export const COMMON_PORTION_LABELS = [
  'Stück',
  'Scheibe',
  'Portion',
  'Tasse',
  'Glas',
  'EL',
  'TL',
  'Handvoll',
  'Packung',
] as const;

/**
 * The suggestions, with the labels already in use appended.
 *
 * Case-insensitive dedupe, and the fixed list wins: it decides that the chip
 * says „Stück“ and not „stück“, which is the whole point of having one.
 */
export function portionLabelSuggestions(
  used: readonly string[],
  limit = 16
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of [...COMMON_PORTION_LABELS, ...used]) {
    const trimmed = label.trim();
    if (trimmed === '') continue;
    const key = trimmed.toLocaleLowerCase('de-DE');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= limit) break;
  }
  return out;
}
