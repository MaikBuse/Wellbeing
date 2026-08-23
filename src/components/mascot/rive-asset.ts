import type { MascotMood } from '@/services/nutrition/mascot';

/**
 * The only file that knows what the artwork is.
 *
 * Everything above this — the mood, the focus, the sentences — is expressed in
 * this app's own vocabulary. Swapping the drawing, or swapping Rive for
 * something else entirely, is meant to cost this file and nothing else.
 *
 * Whether the files are actually present is NOT decided here — see `artwork.ts`,
 * which looks. While they are missing the poster falls back to a glyph and the
 * canvas never mounts, so every appearance renders and reads correctly with no
 * asset in the repository at all.
 *
 * This module stays free of `node:fs` and of the Rive package, because the
 * client island imports it. The functions below type their argument
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
 * These names were read off the file, not guessed.
 *
 * Worth knowing, because the first asset chosen for this failed exactly here:
 * this file exposes NO state machine inputs. `stateMachineInputs('Animations')`
 * returns undefined. Everything is driven through data binding — a bound
 * ViewModel with an emotion enum and a set of triggers. A file that advertises
 * expressions and exposes neither is decoration, and the only way to tell the
 * difference is to load it and ask.
 */
export const STATE_MACHINE = 'Animations';

/** Enum property on the bound ViewModel. Values come from `FaceEmotions`. */
export const FACE_PROPERTY = 'FaceEmotion';

/** The file ships two characters; the default is the other one. */
export const CHARACTER_PROPERTY = 'CharacterSelect';

/*
 * "Merv", the amber one, and not the default "Orson".
 *
 * Orson is a saturated violet. Against #fcf8f9 and the apricot primary of this
 * palette he reads as imported from another product. Merv's amber sits almost
 * exactly on --color-primary, so the figure belongs to the screen it stands on.
 */
export const CHARACTER = 'Merv';

/**
 * Mood to face.
 *
 * The file offers eight faces — Neutral, Happy, Sad, Intense Sad, Angry,
 * Intense Angry, Scared, Eating — and this uses three. Not a shortfall: exactly
 * one state in this app justifies an unhappy face, a measured value above a
 * scored limit, which `coverage.ts` proves at any coverage. "Not enough
 * recorded" and "still short of a target" must NOT look negative, or the figure
 * would be presenting an incomplete diary as a bad diet.
 *
 * `Angry` and the two `Intense` faces stay unused on purpose. The app does not
 * get angry at the person using it, and one day above a salt limit is a thing
 * to notice rather than a thing to be upset about.
 */
export const MOOD_FACE: Record<MascotMood, string> = {
  neutral: 'Neutral',
  curious: 'Neutral',
  happy: 'Happy',
  concerned: 'Sad',
};

/**
 * The one-shot gesture that plays when a mood is entered.
 *
 * This is what separates `curious` from `neutral`: both wear the same face, and
 * the wave is the difference between waiting and asking. `neutral` has none —
 * a flare day or a day with too little recorded should be still.
 */
export const MOOD_GESTURE: Partial<Record<MascotMood, string>> = {
  happy: 'anim_happy',
  concerned: 'anim_sad',
  curious: 'anim_wave',
};

/** The faces that read as unhappy. Exactly one mood may use one. */
export const NEGATIVE_FACES: readonly string[] = [
  'Sad',
  'Intense Sad',
  'Angry',
  'Intense Angry',
  'Scared',
];

/** The moods that may look unhappy. Exactly one, and a test says so. */
export const NEGATIVE_MOODS: readonly MascotMood[] = ['concerned'];

/**
 * The shape of a Rive instance that this module needs, described rather than
 * imported — the package must not appear outside a dynamic import.
 */
export type MoodTarget = {
  viewModelInstance: {
    enum(path: string): { value: string } | null;
    trigger(path: string): { trigger(): void } | null;
  } | null;
};

/**
 * Pick the character. Called once, after load.
 *
 * Separate from `applyMood` because it must not run on every mood change: the
 * enum assignment restarts the character's entry animation, and a figure that
 * re-materialised whenever the salt total moved would be absurd.
 */
export function initCharacter(rive: MoodTarget): void {
  try {
    const pick = rive.viewModelInstance?.enum(CHARACTER_PROPERTY);
    if (pick) pick.value = CHARACTER;
  } catch {
    // Then the default character stands there instead. Still a mascot.
  }
}

/**
 * Set the mood on a live instance.
 *
 * Probes and swallows on purpose. A property name that does not exist returns
 * null in the Rive API rather than throwing, so the failure has to degrade to
 * "the idle animation keeps playing over the poster" instead of to an exception
 * in a render. Nothing is logged: this runs on a screen full of health data and
 * a console line about it would be the wrong habit to start.
 */
export function applyMood(rive: MoodTarget, mood: MascotMood): void {
  try {
    const instance = rive.viewModelInstance;
    if (instance === null) return;

    const face = instance.enum(FACE_PROPERTY);
    if (face) face.value = MOOD_FACE[mood];

    const gesture = MOOD_GESTURE[mood];
    if (gesture) instance.trigger(gesture)?.trigger();
  } catch {
    // The poster underneath is the fallback and it is already correct.
  }
}

/**
 * CC BY 4.0 requires title, creator, source and licence, plus a note on
 * changes. Exported from here so that replacing the asset carries the credit
 * with it and cannot be forgotten in the settings screen.
 */
export const ASSET_ATTRIBUTION = {
  title: 'Responsive Mascots',
  creator: 'RamJamUK',
  source: 'https://rive.app/marketplace/24673-46114-responsive-mascots/',
  licence: 'CC BY 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
  changesDe:
    'Figur „Merv“ gewählt, drei der acht Gesichter den Stimmungen zugeordnet, Standbilder daraus exportiert.',
} as const;
