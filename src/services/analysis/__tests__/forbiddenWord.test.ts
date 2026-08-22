import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The forbidden word must not appear in anything the analysis can render.
 *
 * It is banned because it does not mean what a reader hears: it reads as
 * "proven", and nothing here proves anything — the strongest honest claim is
 * "this is worth testing next". A cheap file-level guard is the right tool,
 * because it survives a year of edits by people who never read this comment.
 *
 * COMMENTS ARE STRIPPED BEFORE SCANNING. The guard is about text a person can
 * end up reading on screen, not about prose explaining the rule — and without
 * stripping, the first file to document the ban would trip it.
 */
const ROOTS = ['src/services/analysis', 'src/components/analysis', 'src/app/(app)/analyse'];
const FORBIDDEN = /signifikan/i;

/** Remove block and line comments, so only renderable text is scanned. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

function filesUnder(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else if (/\.(ts|tsx|css)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('the forbidden word', () => {
  it('never appears in the analysis code', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of filesUnder(root)) {
        // This test file names the word in order to ban it.
        if (file.endsWith('forbiddenWord.test.ts')) continue;
        if (FORBIDDEN.test(stripComments(readFileSync(file, 'utf8')))) {
          offenders.push(file);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('would catch the word in renderable text', () => {
    // Proves the guard is a guard: the same check on a sample string fails.
    expect(FORBIDDEN.test(stripComments("const x = 'signifikant';"))).toBe(true);
    // And proves the stripping does not swallow real code.
    expect(stripComments("const x = 'signifikant'; // note")).toContain('signifikant');
  });

  it('is actually looking at files, not passing on an empty list', () => {
    // Without this, a renamed directory would turn the guard above into a
    // no-op that passes forever.
    const scanned = ROOTS.flatMap(filesUnder).length;
    expect(scanned).toBeGreaterThan(5);
  });
});
