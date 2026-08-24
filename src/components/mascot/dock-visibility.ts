'use client';

/**
 * "He is on his way out" — shared between the header button and the dock.
 *
 * The button writes a database column, so the figure actually disappears when
 * the server re-renders the tree. That is a beat later than the tap, and without
 * this a 144 px drawing would simply blink out of existence — after an entrance
 * that was choreographed frame by frame. `MascotDockFrame` already knows how to
 * duck behind the bar (`hidden` drives `translateY(120%)`); this is how the
 * button gets to ask for it.
 *
 * Since the scroll-driven tuck was removed, this and "not loaded yet" are the
 * only two things that move the figure at all.
 *
 * A module-level store with a listener set rather than context: the two
 * components are in different parts of the layout with no common client parent,
 * and this is the same shape the quiet key in `mascot-dock-frame.tsx` already
 * uses. `getServerSnapshot` says false out loud, so the server renders a
 * standing figure and there is no hydration mismatch.
 *
 * Nothing here is persisted and nothing here is health data — it is one boolean
 * about an animation, and it dies with the page.
 */

const listeners = new Set<() => void>();
let leaving = false;

export function subscribeLeaving(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isLeaving(): boolean {
  return leaving;
}

/** The server cannot know, and before the first tap the answer is always no. */
export function leavingServerSnapshot(): boolean {
  return false;
}

/**
 * Set from the toggle, with the value it just wrote.
 *
 * `setLeaving(!next)` rather than `setLeaving(true)` on the way out only:
 * turning the figure back on before the re-render has landed has to clear the
 * flag, or he stays ducked behind the bar with nothing to bring him back.
 */
export function setLeaving(next: boolean): void {
  if (leaving === next) return;
  leaving = next;
  for (const listener of listeners) listener();
}

/*
 * "He has already walked in" — the same module, for the same reason.
 *
 * The entrance used to hang on a mount, which made it a promise about React's
 * reconciliation rather than about the app: it fired whenever the island
 * happened to be created and it fired again whenever it happened to be created
 * again. Here it is a fact about the SESSION, so it survives every navigation,
 * every revalidation and every Fast Refresh, and the rule is written down
 * instead of inferred.
 *
 * No listener set and no `getServerSnapshot`: this is read imperatively at the
 * moment the drawing reports itself loaded, never rendered, so nothing has to
 * subscribe to it and there is no hydration question to answer.
 */
let walkedIn = false;

export function hasWalkedIn(): boolean {
  return walkedIn;
}

export function markWalkedIn(): void {
  walkedIn = true;
}

/**
 * Fetched back by hand, or swapped for the other figure: either is an arrival,
 * and an arrival is exactly what the walk cycle is for.
 */
export function resetWalkIn(): void {
  walkedIn = false;
}
