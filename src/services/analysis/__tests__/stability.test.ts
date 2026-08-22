import { describe, expect, it } from 'vitest';
import { computeStability, previousWeekKey } from '@/services/analysis/stability';
import { isoWeekKey } from '@/lib/time';

const TZ = 'Europe/Berlin';

function run(iso: string, ranks: Record<string, number | null>, version = 1) {
  return {
    computedAt: new Date(iso),
    algorithmVersion: version,
    ranks: new Map(Object.entries(ranks)),
  };
}

const current = [{ key: 'gluten', rank: 1, status: 'confirmatory' as const }];

function stability(
  currentComputedAt: string,
  priorRuns: ReturnType<typeof run>[],
  version = 1
) {
  return computeStability({
    algorithmVersion: version,
    timeZone: TZ,
    dayStartHour: 4,
    currentComputedAt: new Date(currentComputedAt),
    current,
    priorRuns,
  });
}

describe('isoWeekKey', () => {
  it('assigns a week to the year containing its Thursday', () => {
    // 2026-01-01 is a Thursday, so it belongs to 2026-W01.
    expect(isoWeekKey('2026-01-01')).toBe('2026-W01');
    // 2027-01-01 is a Friday, so it belongs to the last week of 2026.
    expect(isoWeekKey('2027-01-01')).toBe('2026-W53');
  });

  it('keeps a whole Monday-to-Sunday week together', () => {
    const week = isoWeekKey('2026-06-15');
    for (const day of ['2026-06-15', '2026-06-18', '2026-06-21']) {
      expect(isoWeekKey(day)).toBe(week);
    }
    expect(isoWeekKey('2026-06-22')).not.toBe(week);
  });
});

describe('previousWeekKey', () => {
  it('steps back one week, across a year boundary', () => {
    expect(previousWeekKey('2026-W10')).toBe('2026-W09');
    expect(previousWeekKey('2026-W01')).toBe('2025-W52');
  });
});

describe('computeStability', () => {
  it('counts the current week as one', () => {
    const result = stability('2026-06-17T10:00:00Z', []);
    expect(result.get('gluten')?.weeksInTopFive).toBe(1);
  });

  it('extends across consecutive weeks', () => {
    const result = stability('2026-06-17T10:00:00Z', [
      run('2026-06-10T10:00:00Z', { gluten: 2 }),
      run('2026-06-03T10:00:00Z', { gluten: 4 }),
    ]);
    expect(result.get('gluten')?.weeksInTopFive).toBe(3);
  });

  it('does NOT count ten runs in one afternoon as ten weeks', () => {
    // The whole point: with no cooldown on recomputation, this is the only
    // thing standing between her and reacting to resampling noise.
    const result = stability('2026-06-17T20:00:00Z', [
      run('2026-06-17T09:00:00Z', { gluten: 1 }),
      run('2026-06-17T11:00:00Z', { gluten: 1 }),
      run('2026-06-17T13:00:00Z', { gluten: 1 }),
      run('2026-06-17T15:00:00Z', { gluten: 1 }),
    ]);
    expect(result.get('gluten')?.weeksInTopFive).toBe(1);
  });

  it('breaks the chain on a skipped week', () => {
    // "Three weeks" must mean three consecutive weeks, not three runs spread
    // over four months.
    const result = stability('2026-06-17T10:00:00Z', [
      run('2026-06-03T10:00:00Z', { gluten: 1 }),
      run('2026-05-27T10:00:00Z', { gluten: 1 }),
    ]);
    expect(result.get('gluten')?.weeksInTopFive).toBe(1);
  });

  it('breaks the chain on an algorithm-version change', () => {
    // A claim of stability must not span a change in the definition of "top".
    const result = stability('2026-06-17T10:00:00Z', [
      run('2026-06-10T10:00:00Z', { gluten: 1 }, 0),
      run('2026-06-03T10:00:00Z', { gluten: 1 }, 0),
    ]);
    expect(result.get('gluten')?.weeksInTopFive).toBe(1);
  });

  it('breaks the chain when the factor dropped out of the top five', () => {
    const result = stability('2026-06-17T10:00:00Z', [
      run('2026-06-10T10:00:00Z', { gluten: 9 }),
      run('2026-06-03T10:00:00Z', { gluten: 1 }),
    ]);
    expect(result.get('gluten')?.weeksInTopFive).toBe(1);
  });

  it('is zero when the factor is not in the top five now', () => {
    const result = computeStability({
      algorithmVersion: 1,
      timeZone: TZ,
      dayStartHour: 4,
      currentComputedAt: new Date('2026-06-17T10:00:00Z'),
      current: [{ key: 'gluten', rank: 12, status: 'confirmatory' }],
      priorRuns: [run('2026-06-10T10:00:00Z', { gluten: 1 })],
    });
    expect(result.get('gluten')?.weeksInTopFive).toBe(0);
  });

  it('is zero for an uncomputable factor even if it once ranked', () => {
    const result = computeStability({
      algorithmVersion: 1,
      timeZone: TZ,
      dayStartHour: 4,
      currentComputedAt: new Date('2026-06-17T10:00:00Z'),
      current: [{ key: 'gluten', rank: null, status: 'not_computable' }],
      priorRuns: [run('2026-06-10T10:00:00Z', { gluten: 1 })],
    });
    expect(result.get('gluten')?.weeksInTopFive).toBe(0);
  });

  it('is zero for a PROVISIONAL factor, however it once ranked', () => {
    // The guard that matters now that provisional factors are visible: a thin
    // factor must not be able to accumulate "seit 3 Wochen unter den ersten
    // fünf". It has no rank at all, and this pins that it cannot borrow one.
    const result = computeStability({
      algorithmVersion: 1,
      timeZone: TZ,
      dayStartHour: 4,
      currentComputedAt: new Date('2026-06-17T10:00:00Z'),
      current: [{ key: 'gluten', rank: 1, status: 'provisional' }],
      priorRuns: [
        run('2026-06-10T10:00:00Z', { gluten: 1 }),
        run('2026-06-03T10:00:00Z', { gluten: 1 }),
      ],
    });
    expect(result.get('gluten')?.weeksInTopFive).toBe(0);
  });

  it('reports the previous week rank, ignoring same-week runs', () => {
    const result = stability('2026-06-17T20:00:00Z', [
      run('2026-06-17T09:00:00Z', { gluten: 3 }),
      run('2026-06-10T10:00:00Z', { gluten: 7 }),
    ]);
    expect(result.get('gluten')?.previousRank).toBe(7);
  });

  it('keeps the last run of a week, not the first', () => {
    const result = stability('2026-06-17T10:00:00Z', [
      run('2026-06-08T10:00:00Z', { gluten: 9 }),
      run('2026-06-12T10:00:00Z', { gluten: 2 }),
    ]);
    expect(result.get('gluten')?.weeksInTopFive).toBe(2);
    expect(result.get('gluten')?.previousRank).toBe(2);
  });
});
