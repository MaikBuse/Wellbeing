import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MascotState } from '@/services/nutrition/mascot';
import type { DayCompleteness } from '@/services/progress/types';
import { companionAgenda, EMPTY_DOSES, type DoseTally } from '../agenda';

/**
 * The order in which three unrelated things get to speak.
 *
 * Every one of the inputs here was decided somewhere else — this file only
 * checks that the ranking is the promised one and that nothing sneaks a fourth
 * opinion in. The cases mirror the ones `mascot.test.ts` nails down for the
 * mood, because the two files must not disagree about the same day.
 */

const NEUTRAL: MascotState = {
  mood: 'neutral',
  focus: null,
  quiet: null,
  score: null,
};

const CONCERNED: MascotState = {
  mood: 'concerned',
  focus: {
    key: 'salt',
    labelDe: 'Salz',
    kind: 'limit',
    cadence: 'daily',
    remaining: null,
    target: null,
    measured: 7.2,
    isLowerBound: true,
  },
  quiet: null,
  score: 40,
};

const CURIOUS: MascotState = {
  ...CONCERNED,
  mood: 'curious',
  focus: { ...CONCERNED.focus!, key: 'fiber', labelDe: 'Ballaststoffe', kind: 'gap' },
};

const doses = (overdue: number, due = overdue): DoseTally => ({
  due,
  answered: due - overdue,
  open: overdue,
  overdue,
});

const incomplete = (): DayCompleteness => ({
  logDate: '2026-08-23',
  score: 40,
  blocks: [
    { key: 'food', label: 'Essen', share: 0.5, applicable: true, missing: 'noch eine Hauptmahlzeit' },
    { key: 'check', label: 'Tagescheck', share: 0.2, applicable: true, missing: '4 von 5 Kernwerten' },
    { key: 'complaints', label: 'Befinden', share: 1, applicable: true, missing: null },
    { key: 'meds', label: 'Medikamente', share: 0, applicable: false, missing: null },
  ],
});

const complete = (): DayCompleteness => ({
  logDate: '2026-08-23',
  score: 100,
  blocks: [
    { key: 'food', label: 'Essen', share: 1, applicable: true, missing: null },
    { key: 'check', label: 'Tagescheck', share: 1, applicable: true, missing: null },
    { key: 'complaints', label: 'Befinden', share: 1, applicable: true, missing: null },
    { key: 'meds', label: 'Medikamente', share: 1, applicable: true, missing: null },
  ],
});

describe('die Rangfolge', () => {
  it('puts a breached limit in front of everything', () => {
    const agenda = companionAgenda({
      mascot: CONCERNED,
      doses: doses(3),
      completeness: incomplete(),
      isEvening: true,
    });
    expect(agenda.primary.topic).toBe('ernaehrung');
    expect(agenda.more.map((note) => note.topic)).toEqual([
      'medikation',
      'erfassen',
    ]);
  });

  /*
   * The one case that decides whether this is a companion or a nag: a dose whose
   * time has passed can be answered in the next minute, a nutrient gap is only
   * a proposal.
   */
  it('puts an overdue dose in front of a nutrient gap', () => {
    const agenda = companionAgenda({
      mascot: CURIOUS,
      doses: doses(1),
      completeness: complete(),
      isEvening: false,
    });
    expect(agenda.primary.topic).toBe('medikation');
    expect(agenda.primary.doses).toEqual({ open: 1, overdue: 1, due: 1 });
  });

  it('says nothing about a dose that is merely still ahead', () => {
    const agenda = companionAgenda({
      mascot: CURIOUS,
      doses: { due: 2, answered: 0, open: 2, overdue: 0 },
      completeness: complete(),
      isEvening: false,
    });
    expect(agenda.primary.topic).toBe('ernaehrung');
    expect(agenda.more).toEqual([]);
  });

  it('keeps the recording gap for the evening', () => {
    const morning = companionAgenda({
      mascot: NEUTRAL,
      doses: EMPTY_DOSES,
      completeness: incomplete(),
      isEvening: false,
    });
    expect(morning.more).toEqual([]);

    const evening = companionAgenda({
      mascot: NEUTRAL,
      doses: EMPTY_DOSES,
      completeness: incomplete(),
      isEvening: true,
    });
    expect(evening.more.map((note) => note.topic)).toEqual(['erfassen']);
  });

  it('names the weakest block, and only one', () => {
    const agenda = companionAgenda({
      mascot: NEUTRAL,
      doses: EMPTY_DOSES,
      completeness: incomplete(),
      isEvening: true,
    });
    const note = agenda.more[0];
    expect(note.missing).toEqual({
      block: 'check',
      phrase: '4 von 5 Kernwerten',
    });
    expect(note.anchor).toBe('#tagescheck');
  });

  it('never speaks about a block that cannot apply', () => {
    const agenda = companionAgenda({
      mascot: NEUTRAL,
      doses: EMPTY_DOSES,
      completeness: {
        ...complete(),
        blocks: complete().blocks.map((block) =>
          block.key === 'meds'
            ? { ...block, share: 0, applicable: false, missing: null }
            : block
        ),
      },
      isEvening: true,
    });
    expect(agenda.more).toEqual([]);
  });

  /*
   * With nothing to report the figure still has a sentence, because
   * `mascotMoodForDay` answers 'schub' and 'zu_wenig_erfasst' with words of
   * their own. A companion that disappeared on a flare day would be the wrong
   * one to have.
   */
  it('always has something it is about', () => {
    const agenda = companionAgenda({
      mascot: { ...NEUTRAL, quiet: 'schub' },
      doses: EMPTY_DOSES,
      completeness: complete(),
      isEvening: true,
    });
    expect(agenda.primary.topic).toBe('ernaehrung');
    expect(agenda.primary.anchor).toBeNull();
  });

  /*
   * A limit that has already been passed has no repair today, and offering a
   * link to the meal list would suggest the day can be taken back.
   */
  it('offers a way forward only where there is one', () => {
    const overLimit = companionAgenda({
      mascot: CONCERNED,
      doses: EMPTY_DOSES,
      completeness: complete(),
      isEvening: false,
    });
    expect(overLimit.primary.anchor).toBeNull();

    const gap = companionAgenda({
      mascot: CURIOUS,
      doses: EMPTY_DOSES,
      completeness: complete(),
      isEvening: false,
    });
    expect(gap.primary.anchor).toBe('#mahlzeiten');
  });
});

describe('reinheit', () => {
  it('reads no clock and rolls no dice', () => {
    const source = readFileSync('src/services/companion/agenda.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ');
    expect(source).not.toMatch(/new Date|Date\.now|Math\.random/);
    expect(source).not.toMatch(/todayLogDate|isEveningIn/);
  });
});
