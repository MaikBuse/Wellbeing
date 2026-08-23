import { describe, expect, it } from 'vitest';
import { CORE_DAILY_FIELDS } from '@/lib/scales';
import {
  averageScore,
  COMPLETE_DAY_THRESHOLD,
  dayCompleteness,
  emptyCoverage,
  weakestBlock,
} from '../completeness';
import type { DayCoverage, DayDoses } from '../types';
import { counted, START, withSlots } from './fixtures';

const NO_DOSES: DayDoses = { due: 0, answered: 0 };

function full(): DayCoverage {
  return withSlots(counted(START), ['breakfast', 'lunch', 'dinner']);
}

function blockFor(coverage: DayCoverage, doses: DayDoses, key: string) {
  const block = dayCompleteness(coverage, doses).blocks.find(
    (entry) => entry.key === key
  );
  if (!block) throw new Error(`no block ${key}`);
  return block;
}

describe('dayCompleteness', () => {
  it('scores an untouched day at zero', () => {
    const result = dayCompleteness(emptyCoverage(START), NO_DOSES);
    expect(result.score).toBe(0);
  });

  it('scores a fully recorded day with medication at 100', () => {
    const result = dayCompleteness(full(), { due: 2, answered: 2 });
    expect(result.score).toBe(100);
  });

  it('reaches 100 on a day where no medication was due', () => {
    // The point of `applicable`: an absent block must not hold the day at 75 %
    // forever just because nothing was prescribed for it.
    const result = dayCompleteness(full(), NO_DOSES);
    expect(result.score).toBe(100);
    expect(blockFor(full(), NO_DOSES, 'meds').applicable).toBe(false);
  });

  it('does count a due but unanswered dose against the day', () => {
    const result = dayCompleteness(full(), { due: 2, answered: 0 });
    expect(result.score).toBe(75);
  });

  it('counts a half-answered dose list proportionally', () => {
    expect(blockFor(full(), { due: 4, answered: 3 }, 'meds').share).toBe(0.75);
  });

  it('gives a lone snack half credit for food', () => {
    const day = withSlots(counted(START), ['snack']);
    expect(blockFor(day, NO_DOSES, 'food').share).toBe(0.5);
  });

  it('gives two main slots full credit', () => {
    const day = withSlots(counted(START), ['breakfast', 'dinner']);
    expect(blockFor(day, NO_DOSES, 'food').share).toBe(1);
  });

  it('scores the daily check by filled core values', () => {
    const day: DayCoverage = { ...full(), coreFilled: 3 };
    expect(blockFor(day, NO_DOSES, 'check').share).toBeCloseTo(
      3 / CORE_DAILY_FIELDS.length
    );
  });

  it('accepts a symptom entry in place of a wellbeing score', () => {
    const day: DayCoverage = {
      ...full(),
      hasWellbeing: false,
      hasSymptom: true,
    };
    expect(blockFor(day, NO_DOSES, 'complaints').share).toBe(1);
  });

  it('names what is still missing, in German, without health detail', () => {
    const day: DayCoverage = {
      ...emptyCoverage(START),
      hasDailyLog: true,
      coreFilled: 2,
    };
    const missing = dayCompleteness(day, { due: 3, answered: 1 })
      .blocks.map((block) => block.missing)
      .filter(Boolean);
    expect(missing).toEqual([
      'noch keine Mahlzeit',
      '3 von 5 Kernwerten',
      'Beschwerden noch offen',
      '2 von 3 Dosen offen',
    ]);
  });

  it('reports nothing missing on a complete day', () => {
    const blocks = dayCompleteness(full(), { due: 1, answered: 1 }).blocks;
    expect(blocks.every((block) => block.missing === null)).toBe(true);
  });
});

describe('averageScore', () => {
  it('is null for an empty range rather than zero', () => {
    expect(averageScore([])).toBeNull();
  });

  it('rounds the mean', () => {
    const days = [
      dayCompleteness(full(), NO_DOSES),
      dayCompleteness(emptyCoverage(START), NO_DOSES),
    ];
    expect(averageScore(days)).toBe(50);
  });
});

describe('weakestBlock', () => {
  it('names the block that fell short on the most days', () => {
    const days = [
      dayCompleteness({ ...full(), coreFilled: 1 }, { due: 1, answered: 1 }),
      dayCompleteness({ ...full(), coreFilled: 2 }, { due: 1, answered: 1 }),
      dayCompleteness(full(), { due: 1, answered: 0 }),
    ];
    expect(weakestBlock(days)).toEqual({
      key: 'check',
      label: 'Tagescheck',
      days: 2,
    });
  });

  it('ignores a block that never applied', () => {
    // A day with no medication due must not make "Medikamente" the thing to
    // work on — it was never asked for.
    const days = [dayCompleteness(full(), NO_DOSES)];
    expect(weakestBlock(days)).toBeNull();
  });
});

describe('the complete-day threshold', () => {
  it('sits below a perfect day so one soft edge does not disqualify it', () => {
    expect(COMPLETE_DAY_THRESHOLD).toBeLessThan(100);
    expect(dayCompleteness(full(), { due: 1, answered: 1 }).score).toBe(100);
  });
});
