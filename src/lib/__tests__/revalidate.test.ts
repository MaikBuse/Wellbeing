import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHROME } from '../revalidate';

/**
 * The one path set in `revalidate.ts` that is a hand-kept copy of the route
 * tree, checked against the tree.
 *
 * The other sets are judgements — which screens a meal makes stale — and a test
 * could only restate them. `CHROME` is different: it claims to be *every* page
 * in the (app) group, because it exists for a flag the layout reads (the header
 * action, the tab bar, the companion). That claim goes stale the moment somebody
 * adds a route, and nothing about the app would look wrong; the toggle would
 * keep working, because the `x-action-revalidated` signal re-renders whichever
 * route is open regardless of the list. It is the day `use cache` arrives that
 * the omission would bite, which is exactly the failure the module's own header
 * comment says the list is written down to prevent.
 */

const GROUP = 'src/app/(app)';

/**
 * Every URL path under a directory that Next would actually route to.
 *
 * Dynamic segments stay literal (`[date]`, not a value) because `expire()`
 * wants them that way — it passes anything containing `[` to `revalidatePath`
 * with the explicit `'page'` type.
 */
function routesUnder(dir: string, prefix = ''): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);

    if (!statSync(full).isDirectory()) {
      if (entry === 'page.tsx' || entry === 'page.ts') found.push(prefix || '/');
      continue;
    }

    // A leading underscore takes the folder and everything under it out of
    // routing; a name in parentheses is a route group and contributes no URL
    // segment. Neither can appear in a path passed to `revalidatePath`.
    if (entry.startsWith('_')) continue;
    const segment = entry.startsWith('(') && entry.endsWith(')') ? '' : `/${entry}`;
    found.push(...routesUnder(full, prefix + segment));
  }

  return found;
}

describe('CHROME', () => {
  const actual = routesUnder(GROUP);

  it('finds the route tree at all', () => {
    // Guards the guard: an empty scan would make every assertion below pass.
    expect(actual.length).toBeGreaterThan(10);
    expect(actual).toContain('/');
    expect(actual).toContain('/settings');
  });

  it('lists every page in the (app) group', () => {
    const missing = actual.filter((route) => !CHROME.includes(route as never));
    expect(missing).toEqual([]);
  });

  it('lists nothing that is not a page any more', () => {
    const stale = CHROME.filter((route) => !actual.includes(route));
    expect(stale).toEqual([]);
  });

  /*
   * `/analyse/export` is a `route.ts`. Nothing renders it, so there is nothing
   * about it to revalidate — and `revalidatePath` on a route handler would be a
   * statement about a page that does not exist.
   */
  it('leaves route handlers out', () => {
    expect(CHROME).not.toContain('/analyse/export');
  });

  it('has no duplicates', () => {
    expect([...new Set(CHROME)]).toHaveLength(CHROME.length);
  });
});
