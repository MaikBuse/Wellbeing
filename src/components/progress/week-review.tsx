import { Stat, StatGroup } from '@/components/ui/stat';
import { WEEKDAY_SHORT } from '@/lib/scales';
import { formatLogDateShort, weekdayOf, type LogDate } from '@/lib/time';
import {
  averageScore,
  COMPLETE_DAY_THRESHOLD,
  weakestBlock,
} from '@/services/progress/completeness';
import type { DayCompleteness } from '@/services/progress/types';
import { cn } from '@/lib/utils';

/**
 * Seven days as columns, plus the two numbers that summarise them.
 *
 * A quiet weekly close rather than a daily nag. The bar height is the day's
 * completeness and the percentage is printed under it — the height alone would
 * be a value carried by geometry, which is the same mistake as carrying one by
 * colour.
 *
 * The closing sentence names the block that fell short most often. That is the
 * one actionable thing a week of data can say, and it is phrased as a fact
 * ("am häufigsten offen: Medikamente"), never as an instruction.
 */
export function WeekReview({
  days,
  title,
  emptyHint,
}: {
  /** Exactly one entry per day, oldest first. */
  days: DayCompleteness[];
  title: string;
  emptyHint?: string;
}) {
  const average = averageScore(days);
  const complete = days.filter(
    (day) => day.score >= COMPLETE_DAY_THRESHOLD
  ).length;
  const weakest = weakestBlock(days);
  const empty = days.every((day) => day.score === 0);

  return (
    <div>
      <p className="text-sm font-semibold text-fg">{title}</p>

      <ul className="mt-3 flex items-end justify-between gap-1">
        {days.map((day) => (
          <DayColumn key={day.logDate} day={day} />
        ))}
      </ul>

      <StatGroup className="mt-4 border-t border-line-soft pt-3">
        <Stat value={average ?? '—'} unit="%" label="Ø Vollständigkeit" />
        <Stat
          value={complete}
          unit={`von ${days.length}`}
          label={`Tage ab ${COMPLETE_DAY_THRESHOLD} %`}
        />
      </StatGroup>

      {empty && emptyHint ? (
        <p className="mt-2 text-xs text-muted">{emptyHint}</p>
      ) : weakest ? (
        <p className="mt-2 text-xs text-muted">
          Am häufigsten offen: {weakest.label} — an{' '}
          <span className="num">{weakest.days}</span>{' '}
          {weakest.days === 1 ? 'Tag' : 'Tagen'}.
        </p>
      ) : (
        <p className="mt-2 text-xs text-ok">
          Jeder Tag dieser Woche war vollständig.
        </p>
      )}
    </div>
  );
}

function DayColumn({ day }: { day: DayCompleteness }) {
  const weekday = weekdayOf(day.logDate);
  // A floor of 4 % so a zero day still has a visible footprint — an invisible
  // column would read as "no such day" rather than "nothing recorded".
  const height = Math.max(4, day.score);

  return (
    <li className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <span
        className="flex h-20 w-full items-end justify-center rounded-control bg-bg-sunken p-0.5"
        role="img"
        aria-label={`${labelFor(day.logDate)}: ${day.score} Prozent erfasst`}
      >
        <span
          aria-hidden
          className={cn(
            'w-full rounded-[6px] transition-[height] duration-450 ease-out-soft',
            day.score >= COMPLETE_DAY_THRESHOLD ? 'bg-chart-1' : 'bg-calm'
          )}
          style={{ height: `${height}%` }}
        />
      </span>
      <span aria-hidden className="num text-[0.6rem] leading-none text-muted">
        {day.score}
      </span>
      <span
        aria-hidden
        className="text-eyebrow font-semibold uppercase text-muted"
      >
        {WEEKDAY_SHORT[weekday]}
      </span>
    </li>
  );
}

function labelFor(logDate: LogDate): string {
  return formatLogDateShort(logDate);
}
