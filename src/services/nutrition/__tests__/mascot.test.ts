import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { NutrientKey } from '@/lib/nutrients';
import { nutritionDay } from '../score';
import { NUTRIENT_TARGETS } from '../targets/catalog';
import type { TargetValue } from '../targets/types';
import type { NutritionSummary } from '../period';
import type { MascotMood } from '../mascot';
import {
  BOND_STAGE_DAYS,
  WEEK_HAPPY_RATIO,
  mascotBond,
  mascotMoodForDay,
  mascotMoodForWeek,
} from '../mascot';
import {
  CUE_GESTURE,
  MOOD_FACE,
  MOOD_GESTURE,
  NEGATIVE_FACES,
  NEGATIVE_MOODS,
  REST_TRIGGER,
  type MascotCue,
} from '@/components/mascot/rive-asset';
import {
  hasWalkedIn,
  markWalkedIn,
  resetWalkIn,
} from '@/components/mascot/dock-visibility';
import { NUTRITION_TEST_TARGETS, ON_TARGET } from './helpers';
import { dayWith, minTarget, total } from './fixtures';

/**
 * The mascot's mood, and above all the two orderings it must never lose.
 *
 * The one to read twice is "a breached limit outranks an unscorable day". It is
 * the coverage asymmetry from `coverage.ts` carried into a face, and it is one
 * `if` away from being wrong in the direction that matters: a mood that goes
 * worried because a day is thinly recorded would be telling someone their
 * incomplete diary was a bad diet.
 */

const PRIORITY: NutrientKey[] = ['protein', 'fiber', 'calcium', 'epaDha'];

/** A day through the real pipeline, so the statuses are the real statuses. */
function day(
  values: Partial<Record<NutrientKey, number | null>>,
  opts: {
    isFlare?: boolean;
    mainSlots?: number;
    coverage?: number;
    targets?: ReadonlyMap<NutrientKey, TargetValue>;
  } = {}
) {
  const totals: Partial<Record<NutrientKey, ReturnType<typeof total>>> = {};
  for (const [key, value] of Object.entries({ ...ON_TARGET, ...values })) {
    totals[key as NutrientKey] = total(value as number | null, {
      coverage: opts.coverage,
    });
  }
  return nutritionDay(
    dayWith(totals, { mainSlots: opts.mainSlots }),
    opts.targets ?? NUTRITION_TEST_TARGETS,
    { isFlare: opts.isFlare ?? false }
  );
}

function moodOf(
  values: Partial<Record<NutrientKey, number | null>>,
  opts: Parameters<typeof day>[1] = {}
) {
  return mascotMoodForDay({
    day: day(values, opts),
    blocked: null,
    priority: PRIORITY,
  });
}

describe('mascotMoodForDay', () => {
  it('says nothing at all without a profile', () => {
    const state = mascotMoodForDay({
      day: day({}),
      blocked: 'kein_profil',
      priority: PRIORITY,
    });
    expect(state.mood).toBe('neutral');
    expect(state.focus).toBeNull();
    expect(state.quiet).toBe('kein_profil');
  });

  it('says nothing on a day it was not given', () => {
    const state = mascotMoodForDay({ day: null, blocked: null });
    expect(state.mood).toBe('neutral');
    expect(state.focus).toBeNull();
  });

  /*
   * A flare day is neutral in `score.ts` — out of the numerator AND the
   * denominator. A face that reacted to it would be telling someone their
   * flare was a dietary failure, so the flare check sits above everything,
   * including a breached limit.
   */
  it('stays neutral on a flare day even with a perfect score', () => {
    const state = moodOf({}, { isFlare: true });
    expect(state.mood).toBe('neutral');
    expect(state.quiet).toBe('schub');
    expect(state.focus).toBeNull();
  });

  it('stays neutral on a flare day that also breached a limit', () => {
    const state = moodOf({ salt: 12 }, { isFlare: true });
    expect(state.mood).toBe('neutral');
    expect(state.quiet).toBe('schub');
  });

  /* Under-documentation is not under-nutrition. */
  it('gives no focus on a day too thin to score', () => {
    const state = moodOf({ fiber: 4, calcium: 100, magnesium: 20 }, { mainSlots: 1 });
    expect(state.mood).toBe('neutral');
    expect(state.quiet).toBe('zu_wenig_erfasst');
    expect(state.focus).toBeNull();
    expect(state.score).toBeNull();
  });

  /*
   * THE test of this file. Over a limit holds at any coverage, because the
   * grams that were measured were really eaten. Short of a minimum does not.
   * So a day with no score can still be worried, and only about the limit.
   */
  it('is concerned about a breached limit on a day with no score', () => {
    const state = moodOf({ salt: 12, fiber: 4 }, { mainSlots: 1 });
    expect(state.score).toBeNull();
    expect(state.mood).toBe('concerned');
    expect(state.focus?.key).toBe('salt');
    expect(state.focus?.kind).toBe('limit');
    expect(state.focus?.remaining).toBeNull();
  });

  it('is concerned even when coverage is thin', () => {
    const state = moodOf({ salt: 12 }, { coverage: 0.2 });
    expect(state.mood).toBe('concerned');
    expect(state.focus?.key).toBe('salt');
  });

  it('never turns a thinly covered gap into a worry', () => {
    const state = moodOf({ fiber: 4, calcium: 50 }, { coverage: 0.2 });
    expect(state.mood).not.toBe('concerned');
  });

  it('is happy on a day at target, with nothing to point at', () => {
    const state = moodOf({});
    expect(state.mood).toBe('happy');
    expect(state.focus).toBeNull();
    expect(state.score).not.toBeNull();
  });

  it('is curious about the weakest gap, with the amount still missing', () => {
    // Fibre sits at attainment 0 (half the target), magnesium at 0,33.
    const state = moodOf({ fiber: 15, magnesium: 200 });
    expect(state.mood).toBe('curious');
    expect(state.focus?.kind).toBe('gap');
    expect(state.focus?.key).toBe('fiber');
    expect(state.focus?.remaining).toBeCloseTo(15, 10);
    expect(state.focus?.labelDe).toBeTruthy();
  });

  it('ranks by attainment, not by which nutrient we like', () => {
    // Magnesium at 0 beats fibre at 0,07 even though fibre ranks higher in
    // PRIORITY — the priority list is a tie-break, not a thumb on the scale.
    const state = moodOf({ fiber: 16, magnesium: 150 });
    expect(state.focus?.key).toBe('magnesium');
  });

  it('breaks a tie by the day priority', () => {
    // Both flat zero on attainment; fibre comes before calcium in PRIORITY.
    const state = moodOf({ fiber: 15, calcium: 500 });
    expect(state.mood).toBe('curious');
    expect(state.focus?.key).toBe('fiber');
  });

  it('prefers a breached limit over a bigger relative gap', () => {
    const state = moodOf({ salt: 6.5, fiber: 1, calcium: 10 });
    expect(state.mood).toBe('concerned');
    expect(state.focus?.key).toBe('salt');
  });

  it('picks the limit furthest past its bound', () => {
    const targets = new Map(NUTRITION_TEST_TARGETS);
    targets.set('sugar', { ...minTarget(0), direction: 'max', min: null, max: 50 });
    const state = mascotMoodForDay({
      day: day({ salt: 6.6, sugar: 200 }, { targets }),
      blocked: null,
      priority: PRIORITY,
    });
    expect(state.mood).toBe('concerned');
    expect(state.focus?.key).toBe('sugar');
  });

  it('passes a weekly cadence through so the sentence can say so', () => {
    const targets = new Map(NUTRITION_TEST_TARGETS);
    targets.set('fiber', minTarget(30, { cadence: 'weekly' }));
    const state = mascotMoodForDay({
      day: day({ fiber: 15, magnesium: 150 }, { targets }),
      blocked: null,
      priority: PRIORITY,
    });
    expect(state.focus?.key).toBe('fiber');
    expect(state.focus?.cadence).toBe('weekly');
  });

  /*
   * The guard that keeps this module honest for good.
   *
   * `assessNutrient` already reports 'unknown' for every nutrient with
   * showVerdict false, so a mood derived from `status` can never point at one.
   * This breaks the moment somebody compares raw values in `mascot.ts` — which
   * would put iron back on screen as a shortfall and nudge towards a supplement
   * that cannot work in anaemia of inflammation.
   */
  it('never points at a nutrient that carries no verdict', () => {
    const unjudged = Object.values(NUTRIENT_TARGETS)
      .filter((definition) => definition !== undefined && !definition.showVerdict)
      .map((definition) => definition.key);

    expect(unjudged.length).toBeGreaterThan(0);

    for (const key of unjudged) {
      const targets = new Map(NUTRITION_TEST_TARGETS);
      targets.set(key, minTarget(1000));
      const state = mascotMoodForDay({
        day: day({ [key]: 1 }, { targets }),
        blocked: null,
        priority: PRIORITY,
      });
      expect(state.focus?.key, key).not.toBe(key);
      expect(state.mood, key).not.toBe('concerned');
    }
  });

  it('is deterministic', () => {
    const values = { fiber: 16, magnesium: 150, calcium: 700 };
    expect(moodOf(values)).toEqual(moodOf(values));
  });
});

describe('mascotMoodForWeek', () => {
  const summary = (over: Partial<NutritionSummary> = {}): NutritionSummary => ({
    assessableDays: 7,
    goodDays: 6,
    ratio: 6 / 7,
    average: 82,
    flareDaysSkipped: 0,
    unreliableDays: 0,
    weakest: [{ key: 'fiber', labelDe: 'Ballaststoffe', days: 3 }],
    ...over,
  });

  it('stays quiet below the evaluable-days gate', () => {
    const state = mascotMoodForWeek({
      summary: summary({ assessableDays: 3, goodDays: 3, ratio: 1 }),
      minEvaluableDays: 4,
    });
    expect(state.mood).toBe('neutral');
    expect(state.quiet).toBe('zu_wenig_erfasst');
  });

  it('is happy over the ratio bar', () => {
    const state = mascotMoodForWeek({ summary: summary(), minEvaluableDays: 4 });
    expect(state.mood).toBe('happy');
    expect(state.score).toBe(82);
  });

  it('is curious below it, pointing at the weakest nutrient', () => {
    const state = mascotMoodForWeek({
      summary: summary({ goodDays: 1, ratio: 1 / 7 }),
      minEvaluableDays: 4,
    });
    expect(state.mood).toBe('curious');
    expect(state.focus?.key).toBe('fiber');
    // A count of days is not a measured shortfall — no number, no target.
    expect(state.focus?.remaining).toBeNull();
    expect(state.focus?.target).toBeNull();
  });

  it('is never concerned over a window', () => {
    for (const ratio of [0, 0.1, WEEK_HAPPY_RATIO, 1]) {
      const state = mascotMoodForWeek({
        summary: summary({ ratio }),
        minEvaluableDays: 4,
      });
      expect(state.mood).not.toBe('concerned');
    }
  });
});

describe('mascotBond', () => {
  it('counts recorded days, and never goes backwards', () => {
    let previous = -1;
    for (let days = 0; days <= 200; days += 1) {
      const bond = mascotBond(days);
      expect(bond.stage).toBeGreaterThanOrEqual(previous);
      previous = bond.stage;
    }
  });

  it('changes stage exactly at the documented thresholds', () => {
    BOND_STAGE_DAYS.forEach((threshold, index) => {
      expect(mascotBond(threshold).stage).toBe(index);
      if (threshold > 0) expect(mascotBond(threshold - 1).stage).toBe(index - 1);
    });
  });

  it('survives nonsense without inventing a stage', () => {
    expect(mascotBond(-5)).toEqual({ stage: 0, days: 0 });
    expect(mascotBond(3.7).days).toBe(3);
  });
});

/*
 * `mascot.ts` is imported by server components that render for a chosen day,
 * not only for today. A clock read in there would make the mood depend on when
 * the page happened to render, and `Math.random` would make it flicker.
 */
describe('reinheit', () => {
  it('reads no clock and rolls no dice', () => {
    for (const file of ['src/services/nutrition/mascot.ts']) {
      const source = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ');
      expect(source, file).not.toMatch(/new Date|Date\.now|Math\.random/);
      expect(source, file).not.toMatch(/todayLogDate/);
    }
  });
});

/**
 * The asset contract, checked from the side that knows what the moods mean.
 *
 * The objection to this artwork was that it carries only one unhappy face. That
 * is the right number, and this test is what keeps it the right number: the only
 * state this app can justify a negative expression for is a measured value above
 * a scored limit. If a second mood ever maps onto an unhappy face, something
 * upstream has started treating a missing record as a bad diet.
 */
describe('das Stimmungs-Mapping', () => {
  const MOODS: MascotMood[] = ['happy', 'concerned', 'curious', 'neutral'];

  it('has exactly one negative expression, and it is the limit', () => {
    expect(NEGATIVE_MOODS).toEqual(['concerned']);
  });

  it('gives every mood a face', () => {
    for (const mood of MOODS) expect(MOOD_FACE[mood], mood).toBeTruthy();
  });

  it('sends exactly one mood to an unhappy face', () => {
    const unhappy = MOODS.filter((mood) =>
      NEGATIVE_FACES.includes(MOOD_FACE[mood])
    );
    expect(unhappy).toEqual(['concerned']);
  });

  /*
   * `curious` and `neutral` wear the same face, so the gesture is what
   * distinguishes waiting from asking. A flare day must stay still.
   */
  it('separates waiting from asking by gesture, not by face', () => {
    expect(MOOD_FACE.curious).toBe(MOOD_FACE.neutral);
    expect(MOOD_GESTURE.curious).toBeTruthy();
    expect(MOOD_GESTURE.neutral).toBeUndefined();
  });

  /*
   * The reachability half: a gap and a thin day must be able to occur without
   * ever producing the mood the unhappy face is wired to.
   */
  it('reaches the negative expression only through a breached limit', () => {
    const overLimit = moodOf({ salt: 12 });
    expect(NEGATIVE_MOODS).toContain(overLimit.mood);
    expect(overLimit.focus?.kind).toBe('limit');

    for (const state of [
      moodOf({ fiber: 15, calcium: 500 }),
      moodOf({ fiber: 4 }, { mainSlots: 1 }),
      moodOf({}, { isFlare: true }),
      moodOf({}),
    ]) {
      expect(NEGATIVE_MOODS).not.toContain(state.mood);
    }
  });
});

/**
 * The Rive runtime must stay behind a dynamic import.
 *
 * `@rive-app/canvas-single` bundles its WASM into the JavaScript, which is what
 * makes it work offline and also what makes it the largest dependency in the
 * project. A single top-level `import` anywhere would pull it into the shared
 * chunk of every route, and nothing about the running app would look wrong —
 * the day screen would just get quietly heavier for everyone, including the
 * people who turned the mascot off.
 */
/** Every non-test source file under a path, for the two static scans below. */
function sourcesUnder(path: string): string[] {
  if (!statSync(path).isDirectory()) {
    return /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) ? [path] : [];
  }
  return readdirSync(path).flatMap((entry) => sourcesUnder(join(path, entry)));
}

describe('die Rive-Runtime', () => {
  it('is only ever reached through an await import', () => {
    const offenders: string[] = [];
    let mentions = 0;

    for (const file of sourcesUnder('src')) {
      const source = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ');

      for (const line of source.split('\n')) {
        if (!line.includes('@rive-app')) continue;
        mentions += 1;
        if (!line.includes('await import(')) offenders.push(`${file}: ${line.trim()}`);
      }
    }

    expect(offenders).toEqual([]);
    // Proves the scan found the import rather than finding nothing at all.
    expect(mentions).toBeGreaterThan(0);
  });
});

/**
 * There is no still frame behind the figure, and there must not be one again.
 *
 * The stills were a PNG layer under a transparent canvas, and nothing ever hid
 * them: the canvas only faded ITSELF in, and Rive's default `Fit.contain` put
 * the live figure at a different scale than the square crop the PNG was. So the
 * corner showed the mascot twice, once moving and once not — and the diff that
 * did it looked entirely reasonable, which is why this is a test and not a
 * comment.
 *
 * The figure is the .riv or it is nothing. Without JavaScript, before the file
 * loads, and under `prefers-reduced-motion: reduce`, the companion is simply
 * absent and every screen says what it has to say in text.
 */
describe('die Standbild-Schicht', () => {
  it('is gone from the sources, and stays gone', () => {
    const offenders: string[] = [];
    let scanned = 0;

    for (const file of sourcesUnder('src')) {
      scanned += 1;
      const source = readFileSync(file, 'utf8');
      for (const line of source.split('\n')) {
        if (/mascot-poster|MascotPoster|\/mascot\/[\w-]+\.png/.test(line)) {
          offenders.push(`${file}: ${line.trim()}`);
        }
      }
    }

    expect(offenders).toEqual([]);
    // Proves the scan read files rather than an empty directory listing.
    expect(scanned).toBeGreaterThan(0);
  });

  it('leaves no stray drawing in public/mascot', () => {
    const files = readdirSync('public/mascot');
    expect(files.filter((name) => name.endsWith('.png'))).toEqual([]);
    // The one file that does belong there.
    expect(files).toContain('companion-v1.riv');
  });
});

/**
 * The reactions, checked against the same promise the moods are held to.
 *
 * A cue is an acknowledgement of something the person did — a meal recorded, a
 * dose answered, the day closed. None of it is a verdict, so none of it may
 * look like one. The face is left alone entirely: the file offers `Eating`, and
 * at the size this is drawn its open mouth reads as a grimace, which would turn
 * "recorded" into "disapproved of".
 */
describe('die Regungen', () => {
  const CUES: MascotCue[] = ['entrance', 'logged', 'dose', 'closed'];

  it('gives every cue a gesture', () => {
    for (const cue of CUES) expect(CUE_GESTURE[cue], cue).toBeTruthy();
  });

  it('never changes the face', () => {
    const source = readFileSync(
      'src/components/mascot/rive-asset.ts',
      'utf8'
    ).replace(/\/\*[\s\S]*?\*\//g, ' ');
    // The only assignment target for a face is MOOD_FACE.
    expect(source).not.toMatch(/CUE_FACE/);
  });

  /*
   * The four faces this app never wears. Both figures can look angry, terrified
   * and intensely sad; a symptom diary has no business doing any of the three at
   * the person keeping it. `Sad` is the one exception and it belongs to
   * `concerned` alone, which the test above pins down.
   */
  it('leaves the angry, the intense and the frightened faces unused', () => {
    const worn = Object.values(MOOD_FACE);
    for (const face of ['Angry', 'Intense Angry', 'Intense Sad', 'Scared']) {
      expect(worn, face).not.toContain(face);
    }
  });

  it('sends no cue to an unhappy gesture', () => {
    const unhappy = ['anim_sad', 'anim_sadIntense', 'anim_angry', 'anim_scared'];
    for (const cue of CUES) {
      expect(unhappy, cue).not.toContain(CUE_GESTURE[cue]);
    }
  });

  /*
   * The finding that made this whole choreography necessary: the triggers in
   * this file are not one-shot. Two and a half seconds after `anim_wave` the
   * hand is still up. Something has to put it down, and this is the name of the
   * thing that does.
   */
  it('has a way back to standing', () => {
    expect(REST_TRIGGER).toBe('anim_breathLOOP');
  });
});

/**
 * The entrance happens once.
 *
 * It used to hang on a mount, which made it a promise about React's
 * reconciliation rather than about the app — and the complaint that produced
 * this file was exactly that: a companion who ducked away and came back on
 * every page change. The walk cycle belongs to an arrival, and there is one
 * arrival per session plus the ones somebody asks for by hand.
 */
describe('der Auftritt', () => {
  beforeEach(() => {
    resetWalkIn();
  });

  it('has not happened before the drawing loads', () => {
    expect(hasWalkedIn()).toBe(false);
  });

  it('stays true once he is here, however often it is asked', () => {
    markWalkedIn();
    expect(hasWalkedIn()).toBe(true);
    expect(hasWalkedIn()).toBe(true);
  });

  it('starts over when he is fetched back by hand', () => {
    markWalkedIn();
    resetWalkIn();
    expect(hasWalkedIn()).toBe(false);
  });

  /*
   * Coarse on purpose: the unit tests above carry the real weight, and this
   * only pins that the dock still asks. An unguarded `fire('entrance')` is the
   * regression that would bring the whole complaint back, and it would look
   * completely innocent in a diff.
   */
  it('is never fired unguarded by the dock', () => {
    const source = readFileSync(
      'src/components/mascot/mascot-dock-frame.tsx',
      'utf8'
    ).replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(source).toMatch(/hasWalkedIn\(\)/);
    expect(source).toMatch(/markWalkedIn\(\)/);
  });
});

/**
 * The pause is slower than the transition it used to trip over.
 *
 * `PAUSE_AFTER_MS` is not a taste number: while a page changes, the figure is
 * drawn through `::view-transition-*(site-mascot)` pseudo-elements, and for
 * that whole window the IntersectionObserver reads the real element as gone.
 * Pausing there froze him mid-step. The number therefore has to outlast the
 * longest chain of transitions the stylesheet can produce, and this is what
 * keeps the two in the same conversation when either is edited.
 */
describe('die aufgeschobene Pause', () => {
  it('outlasts two of the longest view transitions in the stylesheet', () => {
    const canvas = readFileSync(
      'src/components/mascot/mascot-canvas.tsx',
      'utf8'
    );
    const declared = canvas.match(/const PAUSE_AFTER_MS = (\d+);/);
    expect(declared).not.toBeNull();
    const pauseAfter = Number(declared?.[1]);

    const css = readFileSync('src/app/globals.css', 'utf8');
    const viewTransitions = css.slice(css.indexOf('::view-transition'));
    // Every duration and delay in an animation shorthand, in milliseconds.
    const durations = [...viewTransitions.matchAll(/(\d+)ms/g)].map((m) =>
      Number(m[1])
    );
    expect(durations.length).toBeGreaterThan(0);

    /*
     * The two largest numbers in that section are the duration and the delay of
     * the slowest animation, so their sum is one transition at its longest — a
     * deliberate over-estimate, since the real pair is 400ms + 150ms. Doubled,
     * because tapping a tab runs two transitions back to back: the nav slide,
     * then the handoff from `(app)/loading.tsx` to the content.
     */
    const distinct = [...new Set(durations)].sort((a, b) => b - a);
    const worstChain = (distinct[0] + distinct[1]) * 2;
    expect(pauseAfter).toBeGreaterThan(worstChain);
  });
});
