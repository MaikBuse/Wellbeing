import { describe, expect, it } from 'vitest';
import {
  DAY_MACRO_KEYS,
  groupRemainingNutrients,
  meterStatus,
  selectDayNutrients,
  statusWord,
  toMeterView,
} from '@/lib/nutrition-goals';
import type { NutrientKey } from '@/lib/nutrients';
import type { NutrientAssessment, TargetStatus } from '@/services/nutrition/types';
import type { TargetValue } from '@/services/nutrition/targets/types';

/**
 * The mapping from an assessment to a bar.
 *
 * This is where the day screen lost its numbers: `status: 'unknown'` covers
 * four different situations and only one of them is "nothing was measured",
 * but all four used to render as the same empty dashed track.
 */

function target(fields: Partial<TargetValue> = {}): TargetValue {
  return {
    direction: 'min',
    min: 90,
    max: null,
    bandMax: null,
    unit: 'g',
    cadence: 'daily',
    sourceKeys: ['dach'],
    rationaleDe: 'Testziel',
    origin: 'derived',
    unavailableReason: null,
    ...fields,
  };
}

function assessment(
  fields: Partial<NutrientAssessment> & { key?: NutrientKey } = {}
): NutrientAssessment {
  const value = fields.total?.total ?? 45;
  return {
    key: 'protein',
    target: target(),
    total: {
      fromFood: value,
      fromSupplement: 0,
      total: value,
      coveredGrams: 1000,
      coverage: 1,
    },
    status: 'unknown' as TargetStatus,
    ratio: 0.5,
    isLowerBound: false,
    attainment: null,
    scored: false,
    showValue: true,
    judged: true,
    ...fields,
  };
}

describe('meterStatus', () => {
  it('splits unknown by whether a number exists', () => {
    expect(meterStatus(assessment({ showValue: true }))).toBe('info');
    expect(meterStatus(assessment({ showValue: false }))).toBe('unmeasured');
  });

  it('passes the three verdicts through unchanged', () => {
    expect(meterStatus(assessment({ status: 'met' }))).toBe('in');
    expect(meterStatus(assessment({ status: 'missed' }))).toBe('below');
    expect(meterStatus(assessment({ status: 'exceeded' }))).toBe('over');
  });
});

describe('statusWord', () => {
  it('tells "never judged" from "not judgeable yet"', () => {
    expect(statusWord('info', false)).toBe('nur zur Einordnung');
    expect(statusWord('info', true)).toBe('noch nicht bewertbar');
  });

  it('says nothing about measurements when there is a value', () => {
    // The regression in one line: this used to read "zu wenig Messwerte".
    expect(statusWord('info', true)).not.toContain('Messwerte');
  });
});

describe('toMeterView', () => {
  it('prints the number for every state but unmeasured', () => {
    expect(toMeterView(assessment({ showValue: true })).valueText).toBe('45 g');
    expect(toMeterView(assessment({ showValue: false })).valueText).toBeNull();
  });

  it('fills the bar for a state without a verdict', () => {
    // 45 of 90 g. The old mapping drew this as an empty dashed track.
    const view = toMeterView(assessment({ showValue: true }));
    expect(view.status).toBe('info');
    expect(view.fill).toBeCloseTo(0.5);
  });

  it('marks a band top as not a scored limit', () => {
    // Protein: a minimum with a recommended band above it and no scored cap.
    // Overshooting it must not be painted as a breach.
    const banded = toMeterView(
      assessment({ target: target({ direction: 'range', bandMax: 110 }) })
    );
    expect(banded.hasScoredLimit).toBe(false);

    // Salt: a real limit.
    const limited = toMeterView(
      assessment({
        key: 'salt',
        target: target({ direction: 'max', min: null, max: 6 }),
      })
    );
    expect(limited.hasScoredLimit).toBe(true);
  });

  it('drops the "mindestens" prefix when the value is unmeasured', () => {
    const view = toMeterView(
      assessment({ showValue: false, isLowerBound: true })
    );
    expect(view.isLowerBound).toBe(false);
  });
});

describe('selectDayNutrients', () => {
  const macros = DAY_MACRO_KEYS.map((key) => assessment({ key }));

  it('shows the three macros in order', () => {
    expect(selectDayNutrients(macros).map((entry) => entry.key)).toEqual([
      'carbs',
      'protein',
      'fat',
    ]);
  });

  it('appends an exceeded limit instead of pushing a macro out', () => {
    const salt = assessment({ key: 'salt', status: 'exceeded' });
    const chosen = selectDayNutrients([...macros, salt]);
    // Four rows, and fat is still one of them: the macros were asked for by
    // name, so the limit is added to them rather than swapped in.
    expect(chosen.map((entry) => entry.key)).toEqual([
      'carbs',
      'protein',
      'fat',
      'salt',
    ]);
  });

  it('adds at most one exceeded limit', () => {
    const chosen = selectDayNutrients([
      ...macros,
      assessment({ key: 'salt', status: 'exceeded' }),
      assessment({ key: 'sugar', status: 'exceeded' }),
    ]);
    expect(chosen).toHaveLength(4);
  });

  it('skips a macro that has no target', () => {
    const chosen = selectDayNutrients([assessment({ key: 'protein' })]);
    expect(chosen.map((entry) => entry.key)).toEqual(['protein']);
  });
});

describe('groupRemainingNutrients', () => {
  const all = [
    assessment({ key: 'carbs' }),
    assessment({ key: 'protein' }),
    assessment({ key: 'fat' }),
    assessment({ key: 'fiber' }),
    assessment({ key: 'salt' }),
    assessment({ key: 'epaDha' }),
    assessment({ key: 'vitD' }),
    assessment({ key: 'calcium' }),
  ];

  it('lists everything the day card did not show, grouped', () => {
    const groups = groupRemainingNutrients(all, selectDayNutrients(all));
    expect(groups.map((entry) => entry.group)).toEqual([
      'macro',
      'fat_quality',
      'vitamin',
      'mineral',
    ]);
    expect(groups[0].entries.map((entry) => entry.key)).toEqual([
      'fiber',
      'salt',
    ]);
  });

  it('does not repeat a limit that was promoted to the day card', () => {
    const withExceeded = all.map((entry) =>
      entry.key === 'salt' ? { ...entry, status: 'exceeded' as TargetStatus } : entry
    );
    const shown = selectDayNutrients(withExceeded);
    expect(shown.map((entry) => entry.key)).toContain('salt');

    const keys = groupRemainingNutrients(withExceeded, shown).flatMap((group) =>
      group.entries.map((entry) => entry.key)
    );
    expect(keys).not.toContain('salt');
  });
});
