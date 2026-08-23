import { revalidatePath } from 'next/cache';

/**
 * One place for "what does this mutation make stale".
 *
 * Every server action used to call `revalidatePath` inline, and the sets drifted
 * apart: creating a food revalidated `/foods` but not `/`, so a new food never
 * appeared in the picker chips on the day screen until that route re-rendered
 * for some other reason. That is what this module exists to prevent.
 *
 * Two things are worth knowing before changing anything here.
 *
 * Nothing in this app is cached on the server — `cacheComponents` is off, there
 * is no `use cache` and no `unstable_cache`, and `requireUser()` in the (app)
 * layout makes every route dynamic. So these calls do not expire a server
 * cache; they exist because `revalidatePath` is also what sets
 * `pathWasRevalidated = ActionDidRevalidateStaticAndDynamic`, and that is the
 * signal (`x-action-revalidated`) that makes the client re-render the current
 * route and drop its prefetch cache. The paths are listed so that this stays
 * correct the day a `use cache` is introduced.
 *
 * Do NOT add `refresh()` from `next/cache` here. It sets the *weaker*
 * `ActionDidRevalidateDynamicOnly`, and since it would run after these calls it
 * would downgrade the signal and lose the prefetch-cache eviction.
 */
function expire(paths: readonly string[]): void {
  for (const path of paths) {
    // A dynamic segment needs the explicit type — without it Next warns and
    // the call does nothing.
    if (path.includes('[')) revalidatePath(path, 'page');
    else revalidatePath(path);
  }
}

/**
 * Every screen whose content is a function of a logical day's rows.
 *
 * `/progress` belongs here and not in a set of its own: the streak and the
 * completeness ring are derived from the very rows these mutations write, so a
 * meal added on "Heute" makes the progress screen stale in exactly the same
 * breath. Leaving it out would reproduce the bug this module exists to prevent
 * — a new food revalidating `/foods` but not `/`.
 */
const DAY = [
  '/',
  '/day/[date]',
  '/progress',
  // The nutrient screens are a function of the same rows: a logged meal moves
  // every day total on them. Leaving them out would reproduce exactly the bug
  // in the paragraph above — a new food refreshing /foods but not /.
  '/nutrition',
  '/nutrition/[nutrient]',
] as const;

/** Meals, reactions, the daily check — anything that belongs to one day. */
export function revalidateDay(): void {
  expire(DAY);
}

/**
 * Acknowledging a milestone. Narrower than `revalidateDay` on purpose: it
 * changes which badge is celebrated, not what any day contains.
 */
export function revalidateProgress(): void {
  expire(['/', '/progress']);
}

/**
 * The food library. It feeds the picker chips on the day screen too
 * (`recentFoods` / `frequentFoodsForSlot`), so `/` is not optional here, and the
 * detail page is where nutrients and tags are edited, so it is not either.
 */
export function revalidateFoods(): void {
  expire([...DAY, '/foods', '/foods/[id]']);
}

/**
 * Medications, schedules and intakes — the due-dose list lives on the day.
 *
 * `/nutrition` rides along in DAY, and it has to: a preparation mapped to a
 * nutrient, or a dose ticked off, moves the day totals there.
 */
export function revalidateMedications(): void {
  expire([...DAY, '/medications']);
}

/** Settings that change what the day screen renders. */
export function revalidateSettings(): void {
  expire([...DAY, '/settings']);
}

/**
 * Every page in the (app) group.
 *
 * For a flag the LAYOUT reads rather than a page — the header action, the tab
 * bar, the companion in the corner. `revalidateSettings` was used for the
 * mascot flag while the figure lived on two screens; since it moved into
 * `(app)/layout.tsx` it stands on all of them, and a set that stops at DAY +
 * /settings silently omits /foods, /medications, /scan and everything under
 * /analyse.
 *
 * Nothing breaks today, because the `x-action-revalidated` signal is
 * path-independent and re-renders whichever route is open. The list matters for
 * the reason given at the top of this file: it has to still be right the day a
 * `use cache` is introduced.
 *
 * Exported so `__tests__/revalidate.test.ts` can compare it against the route
 * tree. A hand-kept list of every route is exactly the kind of thing that
 * drifts, and drift is what this module exists to prevent.
 *
 * Pages only. `/analyse/export` is a `route.ts` — nothing renders it, so there
 * is nothing about it to revalidate.
 */
export const CHROME = [
  '/',
  '/day',
  '/day/[date]',
  '/progress',
  '/nutrition',
  '/nutrition/[nutrient]',
  '/foods',
  '/foods/[id]',
  '/foods/new',
  '/medications',
  '/medications/new',
  '/scan',
  '/analyse',
  '/analyse/faktoren',
  '/analyse/faktoren/[key]',
  '/analyse/muster',
  '/analyse/bericht',
  '/settings',
  '/settings/nutrition-goals',
  '/settings/nutrition-goals/profile',
] as const;

export function revalidateChrome(): void {
  expire(CHROME);
}

/**
 * The nutrient profile, the acknowledgement, a target override.
 *
 * Each of these changes what a target IS, so it makes every screen that prints
 * one stale — the day screen included, because the summary card there carries
 * four of them.
 */
export function revalidateNutritionGoals(): void {
  expire([...DAY, '/settings', '/settings/nutrition-goals']);
}

/** The analysis section. A recompute changes every screen under /analyse. */
const ANALYSIS = [
  '/analyse',
  '/analyse/faktoren',
  '/analyse/faktoren/[key]',
  '/analyse/muster',
  '/analyse/bericht',
] as const;

export function revalidateAnalysis(): void {
  expire(ANALYSIS);
}

/**
 * Settings that change what the analysis computes, not just what it shows.
 *
 * `count_trace_exposure` goes into `analysis_run.params`, so flipping it makes
 * the stored run stale in a way a re-render cannot fix — the page has to say
 * that a new run is needed, which is why this expires the analysis too.
 */
export function revalidateAnalysisSettings(): void {
  expire([...DAY, '/settings', ...ANALYSIS]);
}
