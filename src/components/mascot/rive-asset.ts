import type { MascotMood } from '@/services/nutrition/mascot';

/**
 * The only file that knows what the artwork is.
 *
 * Everything above this — the mood, the focus, the sentences — is expressed in
 * this app's own vocabulary. Swapping the drawing, or swapping Rive for
 * something else entirely, is meant to cost this file and nothing else.
 *
 * `HAS_ARTWORK` is false until `public/mascot/` is filled. While it is false the
 * poster falls back to a glyph and the canvas never mounts, so every appearance
 * renders and reads correctly with no asset in the repository at all. That is
 * deliberate: the feature had to be finishable before the licence question was.
 */

/** Flip to true once the .riv and the four posters are in public/mascot/. */
export const HAS_ARTWORK = false;

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
