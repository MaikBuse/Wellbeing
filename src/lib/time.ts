/**
 * The logical day.
 *
 * Every event row stores `occurred_at timestamptz` AND `log_date date`. The
 * logical day runs from `dayStartHour` (default 04:00 local) to the same hour
 * the next day, so:
 *
 *   - a meal at 23:30 lands on that calendar day
 *   - a symptom at 01:00 lands on the PREVIOUS logical day
 *
 * This cannot be a Postgres generated column: `timezone(text, timestamptz)` is
 * STABLE, not IMMUTABLE (the tz database changes), so Postgres rejects it in
 * GENERATED ALWAYS. It therefore lives here, and every write path goes through
 * it. Clients never send `log_date`; the server action derives it.
 *
 * Never compute a day boundary by adding 86_400_000 ms — DST makes days 23 or
 * 25 hours long.
 */

export const DEFAULT_TIME_ZONE = 'Europe/Berlin';
export const DEFAULT_DAY_START_HOUR = 4;

/** A calendar date without time, as 'YYYY-MM-DD'. */
export type LogDate = string;

/** A wall-clock time of day, as 'HH:MM'. */
export type TimeOfDay = string;

type WallParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let cached = formatterCache.get(timeZone);
  if (!cached) {
    cached = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, cached);
  }
  return cached;
}

/** Wall-clock fields of `instant` as observed in `timeZone`. */
function wallParts(instant: Date, timeZone: string): WallParts {
  const parts = formatter(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  const hour = get('hour');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    // Intl can emit hour 24 for midnight in the h23/h24 grey zone.
    hour: hour === 24 ? 0 : hour,
    minute: get('minute'),
    second: get('second'),
  };
}

/** Offset of `timeZone` at `instant`, in ms (positive east of UTC). */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const p = wallParts(instant, timeZone);
  const asIfUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second
  );
  return asIfUtc - instant.getTime();
}

/**
 * Convert a wall-clock time in `timeZone` to the corresponding instant.
 * Two passes so that DST transitions resolve correctly.
 */
function wallToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string,
  minute = 0
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  let ts = naive - zoneOffsetMs(new Date(naive), timeZone);
  ts = naive - zoneOffsetMs(new Date(ts), timeZone);
  return new Date(ts);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Parse 'YYYY-MM-DD' into its calendar fields. Throws on malformed input. */
export function parseLogDate(logDate: LogDate): {
  year: number;
  month: number;
  day: number;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(logDate);
  if (!match) throw new Error(`Invalid log date: ${logDate}`);
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

/** The logical day an instant belongs to. */
export function toLogDate(
  instant: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
  dayStartHour: number = DEFAULT_DAY_START_HOUR
): LogDate {
  const p = wallParts(instant, timeZone);
  // Before the day boundary the instant still belongs to yesterday. Shifting
  // the calendar date via Date.UTC is safe: this is pure calendar arithmetic
  // on a plain date, with no time zone involved.
  const shift = p.hour < dayStartHour ? -1 : 0;
  const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day + shift));
  return formatUtcDate(shifted);
}

function formatUtcDate(d: Date): LogDate {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Half-open instant range [from, to) covered by a logical day. */
export function logDateRange(
  logDate: LogDate,
  timeZone: string = DEFAULT_TIME_ZONE,
  dayStartHour: number = DEFAULT_DAY_START_HOUR
): { from: Date; to: Date } {
  const { year, month, day } = parseLogDate(logDate);
  const from = wallToInstant(year, month, day, dayStartHour, timeZone);
  const next = addDays(logDate, 1);
  const n = parseLogDate(next);
  const to = wallToInstant(n.year, n.month, n.day, dayStartHour, timeZone);
  return { from, to };
}

/**
 * The instant for a wall-clock time *within* a logical day.
 *
 * This is the inverse of `toLogDate` and the only correct way to turn "the user
 * says 13:30 on the day they are looking at" into a timestamptz. Because the
 * logical day starts at `dayStartHour`, a time before that hour belongs to the
 * FOLLOWING calendar date: 01:30 on the logical day 2026-08-21 is 2026-08-22
 * 01:30 local. Getting this backwards would file a late-night entry a day early,
 * which is precisely what the day boundary exists to prevent.
 *
 * Guaranteed: `toLogDate(instantForLogDateTime(d, t, ...), ...) === d`.
 */
export function instantForLogDateTime(
  logDate: LogDate,
  timeOfDay: TimeOfDay,
  timeZone: string = DEFAULT_TIME_ZONE,
  dayStartHour: number = DEFAULT_DAY_START_HOUR
): Date {
  const { hour, minute } = parseTimeOfDay(timeOfDay);
  const shifted = hour < dayStartHour ? addDays(logDate, 1) : logDate;
  const { year, month, day } = parseLogDate(shifted);
  return wallToInstant(year, month, day, hour, timeZone, minute);
}

/** Parse 'HH:MM' into its fields. Throws on malformed input. */
export function parseTimeOfDay(timeOfDay: TimeOfDay): {
  hour: number;
  minute: number;
} {
  const match = /^(\d{2}):(\d{2})$/.exec(timeOfDay);
  if (!match) throw new Error('Invalid time of day');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error('Invalid time of day');
  return { hour, minute };
}

/** 'HH:MM' of an instant in `timeZone` — for pre-filling a time input. */
export function timeOfDayOf(
  instant: Date,
  timeZone: string = DEFAULT_TIME_ZONE
): TimeOfDay {
  const p = wallParts(instant, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Shift a log date by whole days. */
export function addDays(logDate: LogDate, days: number): LogDate {
  const { year, month, day } = parseLogDate(logDate);
  return formatUtcDate(new Date(Date.UTC(year, month - 1, day + days)));
}

/** Whole days between two log dates (b - a). */
export function daysBetween(a: LogDate, b: LogDate): number {
  const pa = parseLogDate(a);
  const pb = parseLogDate(b);
  const ms =
    Date.UTC(pb.year, pb.month - 1, pb.day) -
    Date.UTC(pa.year, pa.month - 1, pa.day);
  return Math.round(ms / 86_400_000);
}

/**
 * Guard against a runaway range. Five years of daily rows is far beyond any
 * real use of this app, and an analysis range is user-influenced input.
 */
export const MAX_RANGE_DAYS = 1830;

/**
 * Every logical day from `from` to `to`, inclusive, contiguous.
 *
 * The analysis needs a dense calendar, not "the days that have rows": a
 * rolling median over the last seven *days* is a different thing from a median
 * over the last seven *entries*, and a rotation test needs a gapless index to
 * rotate over. Built with `addDays` rather than `generate_series` for the same
 * reason `log_date` is not a generated column — the day boundary is time-zone
 * dependent and therefore lives here.
 */
export function eachLogDate(from: LogDate, to: LogDate): LogDate[] {
  const span = daysBetween(from, to);
  if (span < 0) throw new Error('Range ends before it starts');
  if (span + 1 > MAX_RANGE_DAYS) throw new Error('Range too long');
  const days: LogDate[] = [];
  for (let i = 0; i <= span; i++) days.push(addDays(from, i));
  return days;
}

/** The current logical day. */
export function todayLogDate(
  timeZone: string = DEFAULT_TIME_ZONE,
  dayStartHour: number = DEFAULT_DAY_START_HOUR,
  now: Date = new Date()
): LogDate {
  return toLogDate(now, timeZone, dayStartHour);
}

/**
 * True while the logical day still lags the calendar date, i.e. between
 * midnight and `dayStartHour`.
 *
 * The 04:00 boundary is correct but invisible: at 01:00 on Saturday the app
 * says "Heute · Freitag" and looks a day behind. Screens use this to say so out
 * loud instead of leaving the user to guess.
 */
export function isBeforeDayBoundary(
  timeZone: string = DEFAULT_TIME_ZONE,
  dayStartHour: number = DEFAULT_DAY_START_HOUR,
  now: Date = new Date()
): boolean {
  return toLogDate(now, timeZone, dayStartHour) !== toLogDate(now, timeZone, 0);
}

/**
 * ISO week identifier, 'YYYY-Www'.
 *
 * Used to bucket analysis runs: the stability indicator counts consecutive
 * WEEKS a factor stayed near the top, not consecutive runs, because ten runs on
 * one afternoon would otherwise read as ten weeks of agreement.
 */
export function isoWeekKey(logDate: LogDate): string {
  const { year, month, day } = parseLogDate(logDate);
  const date = new Date(Date.UTC(year, month - 1, day));
  // ISO weeks belong to the year containing their Thursday.
  const dayOfWeek = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayOfWeek + 3);
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayOfWeek = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayOfWeek + 3);
  const week =
    1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${isoYear}-W${pad(week)}`;
}

/** ISO weekday, 0 = Monday .. 6 = Sunday. Used by weekly medication schedules. */
export function weekdayOf(logDate: LogDate): number {
  const { year, month, day } = parseLogDate(logDate);
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sun
  return (jsDay + 6) % 7;
}

/** 'Mittwoch, 22. August 2026' */
export function formatLogDateLong(logDate: LogDate): string {
  const { year, month, day } = parseLogDate(logDate);
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** '22.08.' */
export function formatLogDateShort(logDate: LogDate): string {
  const { year, month, day } = parseLogDate(logDate);
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** '19:45' in the user's zone. */
export function formatTime(
  instant: Date,
  timeZone: string = DEFAULT_TIME_ZONE
): string {
  return new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(instant);
}
