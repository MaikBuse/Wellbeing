import Link from 'next/link';
import { ChevronRight, Shield } from 'lucide-react';
import { ProgressRing } from '@/components/ui/progress-ring';
import { SectionLabel } from '@/components/ui/section-label';
import { Spotlight } from '@/components/ui/spotlight';
import { DayDots } from '@/components/progress/day-dots';
import { StreakFlame } from '@/components/progress/streak-flame';
import { missingLabels } from '@/components/progress/completeness-blocks';
import { weekdayOf } from '@/lib/time';
import { JOKER_MAX, tailDays } from '@/services/progress/streak';
import type { DayCompleteness, StreakResult } from '@/services/progress/types';

const TAIL_DAYS = 7;

/**
 * The motivation band on "Heute".
 *
 * Sits above the day summary but stays flatter than it: the day's own numbers
 * are still the point of the screen, and a second full hero competing with them
 * would push the meals below the fold. It carries three things and no more —
 * how long the run is, how complete today is, and what is still open.
 *
 * The "what is still open" line is a set of anchors into the sections further
 * down rather than prose, because the useful response to "Tagescheck fehlt" is
 * a tap, not a sentence.
 */
const ANCHORS: Record<string, string> = {
  food: '#mahlzeiten',
  check: '#tagescheck',
  complaints: '#tagescheck',
  meds: '#medikamente',
};

export function StreakHero({
  streak,
  completeness,
}: {
  streak: StreakResult;
  completeness: DayCompleteness;
}) {
  const days = tailDays(streak, TAIL_DAYS);
  const weekdays = days.map((day) => weekdayOf(day.logDate));
  const open = completeness.blocks.filter(
    (block) => block.applicable && block.missing !== null
  );
  const missing = missingLabels(completeness.blocks);

  return (
    <Spotlight className="rounded-card">
      <section className="rounded-card border border-line bg-gradient-to-br from-card via-card to-soft/50 p-4 shadow-raised">
        <div className="flex items-start justify-between gap-3">
          <SectionLabel>Serie</SectionLabel>
          <Link
            href="/progress"
            className="-my-1 -mr-1 flex items-center gap-0.5 rounded-control px-1 py-1 text-xs font-medium text-primary-strong transition-colors duration-120 hover:bg-primary-tint"
          >
            Fortschritt
            <ChevronRight aria-hidden className="size-3.5" />
          </Link>
        </div>

        <div className="mt-2 flex items-center justify-between gap-4">
          <StreakFlame streak={streak.current} className="min-w-0 flex-1" />
          <ProgressRing
            value={completeness.score}
            max={100}
            suffix="%"
            size={56}
            strokeWidth={5}
            label="Prozent heute erfasst"
          />
        </div>

        <DayDots days={days} weekdayFor={weekdays} className="mt-4" />

        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line-soft pt-3 text-xs text-muted">
          {missing.length > 0 ? (
            <>
              <span>Noch offen:</span>
              {open.map((block) => (
                <Link
                  key={block.key}
                  href={ANCHORS[block.key] ?? '#tagescheck'}
                  className="rounded-pill bg-bg-sunken px-2 py-0.5 font-medium text-primary-strong transition-colors duration-120 hover:bg-primary-tint"
                >
                  {block.missing}
                </Link>
              ))}
            </>
          ) : (
            <span className="font-medium text-ok">
              Heute ist alles erfasst.
            </span>
          )}
        </p>

        <p className="mt-2 flex items-center gap-1 text-xs text-muted">
          <Shield aria-hidden className="size-3.5 shrink-0" />
          <span className="num">{streak.jokersAvailable}</span>
          <span>
            von {JOKER_MAX} Schutztagen — sie überbrücken einen ausgelassenen
            Tag, ersetzen ihn aber nicht.
          </span>
        </p>
      </section>
    </Spotlight>
  );
}
