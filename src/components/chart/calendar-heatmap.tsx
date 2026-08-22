import Link from 'next/link';
import { formatLogDateLong, weekdayOf, type LogDate } from '@/lib/time';
import { rampClassFor, rampTextClassFor } from '@/lib/chart-theme';
import { cn } from '@/lib/utils';

/**
 * The calendar heatmap, which doubles as the day list.
 *
 * `/day/page.tsx` only ever redirected to yesterday — there was no day list at
 * all. This is the better one: it shows the data instead of just the dates, and
 * every cell is a link into that day.
 *
 * Plain CSS grid rather than Recharts, which has no calendar form. Seven columns
 * in a max-w-lg column give cells around 64 px, comfortably past the 44 px
 * target, so no compromise is needed there.
 *
 * Three states, and keeping them apart is the whole point:
 *   - a value  -> a step of the sequential ramp
 *   - zero     -> neutral, NOT the palest rose
 *   - no entry -> a dashed hairline with no fill
 *
 * An unlogged day must never look like a good day. That confusion would flow
 * straight into the analysis as a fake run of good days.
 */
export type CalendarCell = {
  logDate: LogDate;
  value: number | null;
  isFlare: boolean;
};

const WEEKDAY_INITIALS = ['M', 'D', 'M', 'D', 'F', 'S', 'S'];

export function CalendarHeatmap({
  cells,
  /** Print the number in the cell. Sensible up to ~5 weeks. */
  showValues,
  valueLabel,
}: {
  cells: CalendarCell[];
  showValues: boolean;
  valueLabel: string;
}) {
  if (cells.length === 0) return null;

  // Pad the first week so the columns line up with real weekdays.
  const leadingBlanks = weekdayOf(cells[0].logDate);

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAY_INITIALS.map((initial, index) => (
          <span
            key={index}
            aria-hidden
            className="text-center text-eyebrow font-semibold uppercase text-muted"
          >
            {initial}
          </span>
        ))}
      </div>

      <ul className="grid grid-cols-7 gap-1">
        {Array.from({ length: leadingBlanks }, (_, index) => (
          <li key={`blank-${index}`} aria-hidden />
        ))}

        {cells.map((cell) => {
          const day = cell.logDate.slice(8, 10);
          const recorded = cell.value !== null;
          return (
            <li key={cell.logDate}>
              <Link
                href={`/day/${cell.logDate}`}
                // Colour never carries the value alone: the label spells it out,
                // and on short ranges the number sits in the cell as well.
                aria-label={`${formatLogDateLong(cell.logDate)}: ${
                  recorded ? `${valueLabel} ${cell.value}` : 'nicht erfasst'
                }${cell.isFlare ? ', Schub' : ''}`}
                className={cn(
                  'tap flex aspect-square w-full flex-col items-center justify-center rounded-control',
                  'transition-transform duration-120 ease-out-soft active:scale-[0.94]',
                  recorded
                    ? rampClassFor(cell.value)
                    : 'border border-dashed border-line-strong',
                  cell.isFlare && 'ring-2 ring-inset ring-primary-strong'
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'text-[0.6rem] leading-none',
                    recorded ? rampTextClassFor(cell.value) : 'text-muted'
                  )}
                >
                  {day}
                </span>
                {showValues && recorded ? (
                  <span
                    aria-hidden
                    className={cn('num text-sm font-semibold leading-tight', rampTextClassFor(cell.value))}
                  >
                    {cell.value}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The scale legend. Present because a continuous colour scale is otherwise
 * unreadable, and it names the two non-ramp states explicitly.
 */
export function CalendarLegend({ valueLabel }: { valueLabel: string }) {
  return (
    <dl className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      <div className="flex items-center gap-1">
        <dt className="sr-only">Skala</dt>
        <dd className="flex items-center gap-0.5">
          {[0, 2, 4, 6, 8, 10].map((value) => (
            <span
              key={value}
              aria-hidden
              className={cn('size-3 rounded-[3px]', rampClassFor(value))}
            />
          ))}
        </dd>
        <span aria-hidden>{valueLabel} 0 → 10</span>
      </div>
      <div className="flex items-center gap-1">
        <dt className="sr-only">Ohne Eintrag</dt>
        <dd
          aria-hidden
          className="size-3 rounded-[3px] border border-dashed border-line-strong"
        />
        <span>nicht erfasst</span>
      </div>
      <div className="flex items-center gap-1">
        <dt className="sr-only">Schub</dt>
        <dd
          aria-hidden
          className="size-3 rounded-[3px] bg-bg-sunken ring-2 ring-inset ring-primary-strong"
        />
        <span>Schub</span>
      </div>
    </dl>
  );
}
