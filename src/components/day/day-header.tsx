import { formatLogDateLong, type LogDate } from '@/lib/time';
import { cn } from '@/lib/utils';

const RELATIVE: Record<number, string> = {
  [-1]: 'Gestern',
  0: 'Heute',
  1: 'Morgen',
};

/**
 * The day's title. Two staggered lines rather than per-word animation: word
 * spans fragment the accessibility tree for a heading that a screen reader
 * would otherwise read as one phrase, and a two-line stagger reads just as
 * deliberate.
 *
 * The relative word carries the heading whenever there is one. A bare "Freitag,
 * 21. August 2026" gives no clue whether that is today, and when the "Tage" tab
 * used to open yesterday it read as the app having the wrong date.
 */
export function DayHeader({
  logDate,
  offsetDays,
  dayStartHour,
  showBoundaryHint = false,
}: {
  logDate: LogDate;
  /** Whole days from the current logical day: 0 today, -1 yesterday. */
  offsetDays: number;
  dayStartHour: number;
  /** Set while the logical day still lags the calendar date. */
  showBoundaryHint?: boolean;
}) {
  const long = formatLogDateLong(logDate);
  const relative = RELATIVE[offsetDays] ?? null;

  return (
    <header className="pt-3">
      {/* "Heute" is one short word and carries the display size well.
       * "Freitag, 21. August 2026" at the same size wraps to two lines and
       * swamps the screen, so the dated form steps down. */}
      <h1
        className={cn(
          'rise-in text-balance text-fg',
          offsetDays === 0 ? 'text-display' : 'text-title'
        )}
        style={{ '--i': 0 } as React.CSSProperties}
      >
        {relative ?? long}
      </h1>
      {relative ? (
        <p
          className="rise-in mt-1 text-sm text-muted"
          style={{ '--i': 1 } as React.CSSProperties}
        >
          {long}
          {showBoundaryHint ? (
            <>
              {' · '}
              <span className="num">
                {String(dayStartHour).padStart(2, '0')}:00
              </span>{' '}
              beginnt der neue Tag
            </>
          ) : null}
        </p>
      ) : null}
    </header>
  );
}
