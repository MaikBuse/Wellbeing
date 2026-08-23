import Link from 'next/link';
import { Check, Shield } from 'lucide-react';
import { WEEKDAY_SHORT } from '@/lib/scales';
import { formatLogDateLong } from '@/lib/time';
import type { StreakDay } from '@/services/progress/types';
import { cn } from '@/lib/utils';

/**
 * The last few logical days, one tappable dot each.
 *
 * Four states, and keeping them apart is the whole point — the same rule the
 * calendar heatmap states: an unlogged day must never look like a good one.
 *
 *   counted -> filled, with a check
 *   joker   -> outlined, with a shield. Carried, NOT recorded: no data exists
 *              for that day and the analysis will never see one.
 *   missed  -> dashed hairline, no fill
 *   future  -> today, still open. Soft ring, no verdict yet.
 *
 * The shield is a glyph, not a shade, precisely because a joker day must not be
 * mistakable for a recorded one at a glance.
 */
export function DayDots({
  days,
  weekdayFor,
  className,
}: {
  days: StreakDay[];
  /** ISO weekday index (0 = Monday) per day, computed on the server. */
  weekdayFor: number[];
  className?: string;
}) {
  return (
    <ul className={cn('flex items-stretch justify-between gap-1', className)}>
      {days.map((day, index) => {
        const counted = day.state === 'counted';
        const joker = day.state === 'joker';
        const open = day.state === 'future';

        return (
          <li key={day.logDate} className="min-w-0 flex-1">
            <Link
              href={`/day/${day.logDate}`}
              aria-label={`${formatLogDateLong(day.logDate)}: ${LABELS[day.state]}`}
              className={cn(
                'tap flex w-full flex-col items-center justify-center gap-0.5 rounded-control border',
                'transition-transform duration-120 ease-out-soft active:scale-[0.94]',
                counted &&
                  'border-transparent bg-gradient-to-br from-soft to-primary text-primary-fg',
                joker && 'border-line-strong bg-card text-primary-strong',
                open && 'border-primary/40 bg-primary-tint text-primary-strong',
                day.state === 'missed' &&
                  'border-dashed border-line-strong bg-transparent text-muted'
              )}
            >
              <span
                aria-hidden
                className="text-[0.6rem] font-semibold uppercase leading-none"
              >
                {WEEKDAY_SHORT[weekdayFor[index]]}
              </span>
              <span aria-hidden className="grid h-4 place-items-center">
                {counted ? (
                  <Check className="size-3.5" strokeWidth={3} />
                ) : null}
                {joker ? (
                  <Shield className="size-3.5" strokeWidth={2.4} />
                ) : null}
                {open ? (
                  <span className="size-1.5 rounded-pill bg-current" />
                ) : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const LABELS: Record<StreakDay['state'], string> = {
  counted: 'erfasst',
  joker: 'Schutztag, nicht erfasst',
  missed: 'nicht erfasst',
  future: 'heute, noch offen',
};

/** Names the four states in words. Without it the row is decoration. */
export function DayDotsLegend() {
  return (
    <dl className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      <div className="flex items-center gap-1">
        <dt className="sr-only">Erfasst</dt>
        <dd
          aria-hidden
          className="size-3 rounded-[3px] bg-gradient-to-br from-soft to-primary"
        />
        <span>erfasst</span>
      </div>
      <div className="flex items-center gap-1">
        <dt className="sr-only">Schutztag</dt>
        <dd
          aria-hidden
          className="grid size-3 place-items-center rounded-[3px] border border-line-strong"
        >
          <Shield className="size-2 text-primary-strong" strokeWidth={3} />
        </dd>
        <span>Schutztag</span>
      </div>
      <div className="flex items-center gap-1">
        <dt className="sr-only">Nicht erfasst</dt>
        <dd
          aria-hidden
          className="size-3 rounded-[3px] border border-dashed border-line-strong"
        />
        <span>nicht erfasst</span>
      </div>
    </dl>
  );
}
