import type { LogDate } from '@/lib/time';
import type { MealSlotKey } from '@/lib/scales';

/**
 * What one logical day contributes, as read from the database.
 *
 * Deliberately raw counts rather than pre-computed booleans: the streak and the
 * completeness score ask different questions of the same row, and folding them
 * into one flag here would force one of the two to guess.
 */
export type DayCoverage = {
  logDate: LogDate;
  /** Distinct slots with at least one meal item. */
  slots: MealSlotKey[];
  hasDailyLog: boolean;
  /** How many of CORE_DAILY_FIELDS are filled — 0..5. */
  coreFilled: number;
  hasWellbeing: boolean;
  hasSymptom: boolean;
};

export type CompletenessBlockKey = 'food' | 'check' | 'complaints' | 'meds';

export type CompletenessBlock = {
  key: CompletenessBlockKey;
  label: string;
  /** 0..1 within the block. Meaningless when `applicable` is false. */
  share: number;
  /**
   * False when the block cannot apply to this day at all — today only ever
   * means "no medication was due". Such a block is dropped from the average
   * rather than scored as zero: not applicable is not the same as not done,
   * which is the same distinction `adherenceForWindow` makes by returning null.
   */
  applicable: boolean;
  /** Short German phrase naming what is still missing, or null when complete. */
  missing: string | null;
};

export type DayCompleteness = {
  logDate: LogDate;
  /** 0..100, rounded. Average over the applicable blocks. */
  score: number;
  blocks: CompletenessBlock[];
};

/** Per-day medication state, reconstructed from schedules — never from rows. */
export type DayDoses = {
  due: number;
  answered: number;
};

export type StreakDayState = 'counted' | 'joker' | 'missed' | 'future';

export type StreakDay = {
  logDate: LogDate;
  state: StreakDayState;
};

export type StreakResult = {
  /** Days in the current run, joker days included. */
  current: number;
  /** Longest run ever, joker days included. */
  longest: number;
  /** Unspent protection days, 0..JOKER_MAX. */
  jokersAvailable: number;
  /** Total days that actually counted — the number GLOBAL_GATES compares to. */
  countedDays: number;
  /** One entry per logical day, oldest first. */
  days: StreakDay[];
};
