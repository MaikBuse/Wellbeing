import { formatLogDateLong, type LogDate } from '@/lib/time';
import { cn } from '@/lib/utils';

/**
 * The day's title. Two staggered lines rather than per-word animation: word
 * spans fragment the accessibility tree for a heading that a screen reader
 * would otherwise read as one phrase, and a two-line stagger reads just as
 * deliberate.
 */
export function DayHeader({
  logDate,
  isToday,
}: {
  logDate: LogDate;
  isToday: boolean;
}) {
  const long = formatLogDateLong(logDate);

  return (
    <header className="pt-3">
      {/* "Heute" is one short word and carries the display size well.
        * "Freitag, 21. August 2026" at the same size wraps to two lines and
        * swamps the screen, so the dated form steps down. */}
      <h1
        className={cn(
          'rise-in text-balance text-fg',
          isToday ? 'text-display' : 'text-title'
        )}
        style={{ '--i': 0 } as React.CSSProperties}
      >
        {isToday ? 'Heute' : long}
      </h1>
      {isToday ? (
        <p
          className="rise-in mt-1 text-sm text-muted"
          style={{ '--i': 1 } as React.CSSProperties}
        >
          {long}
        </p>
      ) : null}
    </header>
  );
}
