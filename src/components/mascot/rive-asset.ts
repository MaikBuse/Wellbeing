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
 * The gesture that plays when a mood is entered.
 *
 * This is what separates `curious` from `neutral`: both wear the same face, and
 * the wave is the difference between waiting and asking. `neutral` has none —
 * a flare day or a day with too little recorded should be still.
 *
 * NOT one-shot, which the name in the file suggests and the file does not do.
 * Every trigger here settles into a HELD POSE: two and a half seconds after
 * `anim_wave` the hand is still up, after `anim_cookie` the cookie is still in
 * both paws. Whatever fires one of these owes the figure a `restPose` — see
 * `GESTURE_HOLD_MS`.
 */
export const MOOD_GESTURE: Partial<Record<MascotMood, string>> = {
  happy: 'anim_happy',
  concerned: 'anim_sad',
  curious: 'anim_wave',
};

/**
 * Back to standing.
 *
 * `anim_reset`, `anim_idle` and `anim_breathLOOP` all clear a held pose; this is
 * the breathing loop because it is the only one of the three that also gives the
 * figure something to do afterwards. A mascot frozen mid-frame reads as a broken
 * image, and this app keeps a PWA open for days.
 */
export const REST_TRIGGER = 'anim_breathLOOP';

/** A slower variation on standing, so a long-open screen is not a photograph. */
export const IDLE_TRIGGER = 'anim_idle';

/** How long a pose is held before `restPose` takes it back. */
export const GESTURE_HOLD_MS = 1800;

/** How often the resting figure varies its stance. */
export const IDLE_EVERY_MS = 45_000;

/**
 * What the figure does about something the person just did.
 *
 * Separate from the mood on purpose, and the difference is what each one is
 * ABOUT. A mood is a reading of the day; a cue is an acknowledgement of an
 * action, and it passes. Nothing here grades anything: `logged` fires when a
 * meal is recorded, not when a good meal is recorded, which is the same promise
 * the mood side keeps by never looking at a single food.
 *
 * `entrance` is the walk cycle, and it walks ON THE SPOT — the figure never
 * leaves the middle of its box. It is fired while the dock slides up from behind
 * the tab bar, and the two together are what reads as stepping out.
 *
 * NO CUE TOUCHES THE FACE. The file offers an `Eating` face and it would be the
 * obvious partner for `anim_cookie`, but at the 112 px this is drawn at, its
 * open mouth reads as a grimace rather than as a bite. The cookie in both paws
 * carries the meaning, and the face keeps saying what the day says.
 */
export type MascotCue = 'entrance' | 'logged' | 'dose' | 'closed';

export const CUE_GESTURE: Record<MascotCue, string> = {
  entrance: 'anim_walk_front',
  logged: 'anim_cookie',
  dose: 'anim_happy',
  closed: 'anim_wave',
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
 * Fire a gesture without touching the face.
 *
 * Same probe-and-swallow contract as `applyMood`, and the same reason for it.
 */
export function applyCue(rive: MoodTarget, cue: MascotCue): void {
  try {
    rive.viewModelInstance?.trigger(CUE_GESTURE[cue])?.trigger();
  } catch {
    // The poster underneath is the fallback and it is already correct.
  }
}

/** Let go of whatever pose is being held. */
export function restPose(rive: MoodTarget, trigger: string = REST_TRIGGER): void {
  try {
    rive.viewModelInstance?.trigger(trigger)?.trigger();
  } catch {
    // See above.
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
    'Figur „Merv“ gewählt, drei der acht Gesichter den Stimmungen zugeordnet, sechs der elf Bewegungen verwendet, Standbilder daraus exportiert.',
} as const;
