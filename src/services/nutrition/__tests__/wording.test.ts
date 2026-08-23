import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Words the nutrient screens must not use, in the spirit of
 * `analysis/__tests__/forbiddenWord.test.ts`.
 *
 * "Mangel" is a diagnosis. This app measures what was eaten against a reference
 * table; it cannot tell a low intake from a deficiency, and the two are not the
 * same thing — someone can eat below the reference value for years without
 * being deficient, and someone can be deficient while eating plenty.
 *
 * "Verpasst" and "gescheitert" are the loss-aversion vocabulary this layer is
 * explicitly built to avoid. The honest word for a day below a target is
 * "darunter" and for a day nobody could measure it is "unbekannt".
 *
 * COMMENTS ARE STRIPPED before scanning, so prose explaining the rule — this
 * paragraph included — does not trip it.
 */
const ROOTS = [
  'src/services/nutrition',
  'src/components/nutrition',
  'src/app/(app)/nutrition',
  'src/lib/nutrition-goals.ts',
  // The mascot speaks in whole sentences, so it carries more prose than any
  // other part of this feature and needs the guard most.
  'src/lib/mascot-copy.ts',
  'src/components/mascot',
  // The companion speaks about medication and about the diary too, and those
  // are the two places where a scolding word would slip in most easily.
  'src/services/companion',
];

const FORBIDDEN = [
  { word: 'Mangel', pattern: /\bmangel/i },
  { word: 'verpasst', pattern: /verpasst/i },
  { word: 'gescheitert', pattern: /gescheiter/i },
  { word: 'versagt', pattern: /versag/i },
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

function filesUnder(path: string): string[] {
  let stats;
  try {
    stats = statSync(path);
  } catch {
    return [];
  }
  if (!stats.isDirectory()) return /\.(ts|tsx)$/.test(path) ? [path] : [];

  const out: string[] = [];
  for (const entry of readdirSync(path)) {
    out.push(...filesUnder(join(path, entry)));
  }
  return out;
}

describe('die verbotenen Wörter', () => {
  it('never appear in the nutrient code', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of filesUnder(root)) {
        if (file.endsWith('wording.test.ts')) continue;
        const source = stripComments(readFileSync(file, 'utf8'));
        for (const { word, pattern } of FORBIDDEN) {
          if (pattern.test(source)) offenders.push(`${file}: ${word}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /* Proves the guard is a guard rather than a regex that matches nothing. */
  it('would catch each of them in renderable text', () => {
    const samples = [
      "const a = 'Vitamin-D-Mangel';",
      "const b = 'Ziel verpasst';",
      "const c = 'Woche gescheitert';",
      "const d = 'heute versagt';",
    ];
    for (const sample of samples) {
      const hit = FORBIDDEN.some(({ pattern }) =>
        pattern.test(stripComments(sample))
      );
      expect(hit, sample).toBe(true);
    }
    // ...and does not swallow the words the app is supposed to use.
    const allowed = "const e = 'unter dem Ziel'; const f = 'zu wenig Messwerte';";
    for (const { pattern } of FORBIDDEN) {
      expect(pattern.test(stripComments(allowed))).toBe(false);
    }
  });

  it('is actually looking at files', () => {
    expect(ROOTS.flatMap(filesUnder).length).toBeGreaterThan(10);
  });
});
