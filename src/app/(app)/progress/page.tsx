import { ViewTransition } from 'react';
import { Card, CardHeader, CardMeta, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Stat, StatGroup } from '@/components/ui/stat';
import { CompletenessBlocks } from '@/components/progress/completeness-blocks';
import { DayDots, DayDotsLegend } from '@/components/progress/day-dots';
import { MilestoneGrid } from '@/components/progress/milestone-grid';
import { StreakFlame } from '@/components/progress/streak-flame';
import { WeekReview } from '@/components/progress/week-review';
import { requireUserWithSettings } from '@/auth.helpers';
import { todayLogDate, weekdayOf } from '@/lib/time';
import { averageScore } from '@/services/progress/completeness';
import { loadProgress } from '@/services/progress/loader';
import {
  JOKER_EARN_EVERY,
  JOKER_MAX,
  tailDays,
} from '@/services/progress/streak';
import type { CompletenessBlock } from '@/services/progress/types';

export const metadata = { title: 'Fortschritt – Wellbeing' };

/**
 * Seven, not fourteen. Fourteen tappable columns inside a max-w-lg page are
 * about 24 px wide — below the 44 px floor every target in this app keeps. The
 * fortnight is still visible right below, as the two weeks of the review.
 */
const RECENT_DAYS = 7;
const AVERAGE_DAYS = 30;

export default async function ProgressPage() {
  const { user, settings } = await requireUserWithSettings();
  const today = todayLogDate(settings.timeZone, settings.dayStartHour);
  const progress = await loadProgress(user.id, today);

  const recent = tailDays(progress.streak, RECENT_DAYS);
  const recentWeekdays = recent.map((day) => weekdayOf(day.logDate));

  const lastThirty = progress.window.slice(-AVERAGE_DAYS);
  const thisWeek = progress.window.slice(-7);
  const previousWeek = progress.window.slice(-14, -7);

  return (
    // Reached from the "Heute" hero, so it joins the same directional slide the
    // rest of the app uses rather than appearing without motion.
    <ViewTransition
      enter={{
        'nav-forward': 'nav-forward',
        'nav-back': 'nav-back',
        default: 'content-in',
      }}
      exit={{
        'nav-forward': 'nav-forward',
        'nav-back': 'nav-back',
        default: 'none',
      }}
      default="none"
    >
      <main className="space-y-4 p-4">
        <PageHeader
          eyebrow="Dranbleiben"
          title="Fortschritt"
          description="Wie lückenlos erfasst wurde — und wie gründlich."
        />

        <Card>
          <CardHeader>
            <CardTitle>Serie</CardTitle>
            <CardMeta>
              Ein Tag zählt, sobald eine Mahlzeit und entweder der Tagescheck
              oder eine Beschwerde erfasst ist — genau die Tage, mit denen die
              Auswertung rechnen darf.
            </CardMeta>
          </CardHeader>

          <StreakFlame streak={progress.streak.current} />

          <StatGroup className="mt-4 border-t border-line-soft pt-3">
            <Stat
              value={progress.streak.longest}
              unit="Tage"
              label="längste Serie"
            />
            <Stat
              value={progress.streak.countedDays}
              unit="Tage"
              label="insgesamt erfasst"
            />
            <Stat
              value={progress.streak.jokersAvailable}
              unit={`von ${JOKER_MAX}`}
              label="Schutztage"
            />
          </StatGroup>

          <div className="mt-4 space-y-2">
            <DayDots days={recent} weekdayFor={recentWeekdays} />
            <DayDotsLegend />
          </div>

          <p className="mt-3 text-xs text-muted">
            Für je {JOKER_EARN_EVERY} erfasste Tage kommt ein Schutztag dazu,
            höchstens {JOKER_MAX} auf Vorrat. Er überbrückt eine Lücke in der
            Serie — die Daten dieses Tages ersetzt er nicht, und in der Analyse
            zählt er nicht als erfasster Tag.
          </p>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Diese Woche</CardTitle>
            <CardMeta>
              Vollständigkeit heißt: Essen, Tagescheck, Befinden und fällige
              Medikamente. Was an einem Tag gar nicht anstand, zählt nicht
              dagegen.
            </CardMeta>
          </CardHeader>

          <WeekReview
            days={thisWeek}
            title="Letzte 7 Tage"
            emptyHint="Noch nichts erfasst — der erste Eintrag füllt die erste Säule."
          />

          {previousWeek.length === 7 ? (
            <div className="mt-5 border-t border-line-soft pt-4">
              <WeekReview days={previousWeek} title="Die 7 Tage davor" />
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader
            action={
              <p className="num text-metric font-semibold text-fg">
                {averageScore(lastThirty) ?? 0}
                <span className="ml-0.5 text-sm font-normal text-muted">%</span>
              </p>
            }
          >
            <CardTitle>Vollständigkeit über {AVERAGE_DAYS} Tage</CardTitle>
            <CardMeta>Woran es im Schnitt noch fehlt.</CardMeta>
          </CardHeader>

          <CompletenessBlocks blocks={averageBlocks(lastThirty)} />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Meilensteine</CardTitle>
            <CardMeta>
              Die letzten beiden sind die Fallzahl-Schwellen der Auswertung: ab
              dort darf sie von gesicherten Ergebnissen sprechen.
            </CardMeta>
          </CardHeader>

          <MilestoneGrid milestones={progress.milestones} />
        </Card>
      </main>
    </ViewTransition>
  );
}

/**
 * The four blocks averaged over the window.
 *
 * A block counts as applicable if it applied on any day at all — otherwise a
 * person with no medications would see "Medikamente 0 %" forever, which is the
 * exact confusion `applicable` exists to prevent. Days on which it did not
 * apply are left out of its own average rather than folded in as zeroes.
 */
function averageBlocks(
  days: { blocks: CompletenessBlock[] }[]
): CompletenessBlock[] {
  if (days.length === 0) return [];

  return days[0].blocks.map((template, index) => {
    const applicableDays = days
      .map((day) => day.blocks[index])
      .filter((block) => block?.applicable);

    const share =
      applicableDays.length === 0
        ? 0
        : applicableDays.reduce((sum, block) => sum + block.share, 0) /
          applicableDays.length;

    return {
      key: template.key,
      label: template.label,
      share,
      applicable: applicableDays.length > 0,
      missing: null,
    };
  });
}
