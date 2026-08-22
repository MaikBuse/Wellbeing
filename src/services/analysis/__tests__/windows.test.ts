import { describe, expect, it } from 'vitest';
import {
  ONSET_LAG_MINUTES,
  ONSET_LAG_ORDER,
  lagFromMinutes,
  type OnsetLagKey,
} from '@/lib/scales';

describe('ONSET_LAG_MINUTES', () => {
  it('agrees with lagFromMinutes at every boundary', () => {
    // These are two spellings of the same fact: the chip she taps and the
    // window the analysis measures. If they drift, the exposure stops meaning
    // what the label says, silently.
    for (const key of ONSET_LAG_ORDER) {
      const { fromMinutes, toMinutes } = ONSET_LAG_MINUTES[key];
      expect(lagFromMinutes(fromMinutes)).toBe(key);
      if (toMinutes !== null) {
        expect(lagFromMinutes(toMinutes - 1)).toBe(key);
        // Half-open: the upper bound belongs to the NEXT bucket.
        expect(lagFromMinutes(toMinutes)).not.toBe(key);
      }
    }
  });

  it('puts exactly 30 minutes in early, not immediate', () => {
    expect(lagFromMinutes(29)).toBe('immediate');
    expect(lagFromMinutes(30)).toBe('early');
  });

  it('covers the line without gaps or overlaps', () => {
    const ordered = ONSET_LAG_ORDER.map((k) => ONSET_LAG_MINUTES[k]);
    expect(ordered[0].fromMinutes).toBe(0);
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i].fromMinutes).toBe(ordered[i - 1].toMinutes);
    }
    expect(ordered[ordered.length - 1].toMinutes).toBeNull();
  });

  it('leaves next_day open-ended, because it is a day-level window', () => {
    expect(ONSET_LAG_MINUTES.next_day.toMinutes).toBeNull();
    expect(lagFromMinutes(5000)).toBe('next_day');
  });

  it('has an entry for every lag key', () => {
    const keys = Object.keys(ONSET_LAG_MINUTES) as OnsetLagKey[];
    expect(new Set(keys)).toEqual(new Set(ONSET_LAG_ORDER));
  });
});
