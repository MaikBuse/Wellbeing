import type { MascotMood } from '@/services/nutrition/mascot';

/**
 * The only file that knows what the artwork is.
 *
 * Everything above this — the mood, the focus, the sentences — is expressed in
 * this app's own vocabulary. Swapping the drawing, or swapping Rive for
 * something else entirely, is meant to cost this file and nothing else.
 *
 * Whether the files are actually present is NOT decided here — see
 * `artwork.ts`, which looks. While they are missing the poster falls back to a
 * glyph and the canvas never mounts, so every appearance renders and reads
 * correctly with no asset in the repository at all. That is deliberate: the
 * feature had to be finishable before the licence question was.
 *
 * This module stays free of `node:fs` and of the Rive package, because the
 * client island imports it. `applyMood` therefore types its argument
 * structurally, and `mascot.test.ts` checks that `@rive-app` only ever appears
 * behind an `await import(`.
 */

/**
 * Versioned filename so replacing the artwork does not force a service-worker
 * cache bump for every other asset.
 */
export const RIVE_SRC = '/mascot/companion-v1.riv';

export const POSTER_SRC: Record<MascotMood, string> = {
  happy: '/mascot/happy.png',
  concerned: '/mascot/concerned.png',
  curious: '/mascot/curious.png',
  neutral: '/mascot/neutral.png',
};

/*
 * PLACEHOLDERS until the file is opened in a Rive viewer.
 *
 * The artboard name, the state machine name and the input name all come from
 * whoever built the .riv, and guessing them wrong is a silent no-op rather than
 * an error. `applyMood` therefore probes and swallows, and the canvas keeps the
 * poster underneath, so a wrong name here degrades to a still image instead of
 * to a blank box.
 */
export const ARTBOARD = 'Mascot';
export const STATE_MACHINE = 'State Machine 1';
export const MOOD_INPUT = 'mood';

/**
 * Mood to state-machine input value.
 *
 * The source asset carries six expressions and this maps four of them. That is
 * not a shortfall: exactly one state in this app justifies a negative face — a
 * measured value above a scored limit, which `coverage.ts` proves at any
 * coverage. "Not enough recorded" and "still short of a target" must NOT look
 * negative, or the figure would be presenting an incomplete diary as a bad
 * diet. `mascot.test.ts` pins that down.
 */
export const MOOD_INPUT_VALUE: Record<MascotMood, number> = {
  neutral: 0,
  curious: 1,
  happy: 2,
  concerned: 3,
};

/** The moods that may look unhappy. Exactly one, and a test says so. */
export const NEGATIVE_MOODS: readonly MascotMood[] = ['concerned'];

/**
 * CC BY 4.0 requires title, creator, source and licence, plus a note on
 * changes. Exported from here so that replacing the asset carries the credit
 * with it and cannot be forgotten in the settings screen.
 */
export const ASSET_ATTRIBUTION = {
  title: 'Rive App Mascot — Cloud Character with State Machine & 6 Expressions',
  creator: 'AnggaMotion',
  source:
    'https://rive.app/marketplace/26964-50676-rive-app-mascot-cloud-character-with-state-machine-and-6-expressions/',
  licence: 'CC BY 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
  changesDe: 'Ausdrücke den vier Stimmungen zugeordnet, Standbilder exportiert.',
} as const;

/**
 * The shape of a Rive instance that this module needs, described rather than
 * imported — the package must not appear outside a dynamic import.
 */
export type MoodTarget = {
  stateMachineInputs(name: string): { name: string; value: number | boolean }[];
};

/**
 * Set the mood on a live instance.
 *
 * Probes and swallows on purpose. The artboard, state machine and input names
 * come from whoever built the .riv, and the three constants above are
 * placeholders until someone opens it in a viewer. A wrong name is a silent
 * no-op in the Rive API, so the failure has to degrade to "the default
 * animation keeps playing over the poster" rather than to a thrown error in a
 * render. Nothing is logged: this runs on a screen full of health data and a
 * console line about it would be the wrong habit to start.
 */
export function applyMood(rive: MoodTarget, mood: MascotMood): void {
  try {
    const input = rive
      .stateMachineInputs(STATE_MACHINE)
      .find((candidate) => candidate.name === MOOD_INPUT);
    if (input) input.value = MOOD_INPUT_VALUE[mood];
  } catch {
    // Placeholder names, or a file without that state machine. The poster
    // underneath is the fallback and it is already correct.
  }
}
