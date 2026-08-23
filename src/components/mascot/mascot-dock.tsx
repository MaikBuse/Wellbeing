import Link from 'next/link';
import { requireUserWithSettings } from '@/auth.helpers';
import { mascotCopy, noteCopy } from '@/lib/mascot-copy';
import { todayLogDate } from '@/lib/time';
import { loadCompanion } from '@/services/companion/loader';
import type { CompanionNote } from '@/services/companion/agenda';
import { MascotDockFrame } from './mascot-dock-frame';
import { HAS_RIVE } from './artwork';

/**
 * The companion, on every screen of the app.
 *
 * Rendered by the (app) layout inside a `<Suspense>`, and that boundary is the
 * condition for the whole arrangement: without it `/settings` would wait on a
 * ninety-day nutrient read before painting anything. He streams in a moment
 * late instead, which is exactly right for somebody walking into the room.
 *
 * HE ALWAYS SPEAKS ABOUT TODAY. On `/day/2026-08-01` the page is a record of a
 * past day and the figure in the corner is not part of it — a companion who
 * changed his mind about what day it is depending on which page was open would
 * be a widget, not a companion. The dated screen says everything about that day
 * in its own text.
 *
 * All of it is server markup. The client island below receives a mood enum,
 * three counters and two slots of finished HTML.
 *
 * The drawing is the only depiction there is — there are no still frames any
 * more — so a missing .riv means no companion rather than a broken image, and
 * the check for it comes before the ninety-day read that would otherwise be
 * done for nothing.
 */
export async function MascotDock() {
  const { user, settings } = await requireUserWithSettings();
  if (!settings.showMascot) return null;
  if (!HAS_RIVE) return null;

  const today = todayLogDate(settings.timeZone, settings.dayStartHour);
  const data = await loadCompanion(user.id, today, settings);

  const mood = mascotCopy({
    state: data.state,
    step: data.step,
    scope: 'day',
    bond: data.bond,
  });

  /** The headline of a note, whichever topic it belongs to. */
  const headlineOf = (note: CompanionNote): string =>
    noteCopy(note)?.headline ?? mood.headline;

  const label = `Begleiter, ${mood.moodLabel}. ${headlineOf(data.agenda.primary)}`;

  /*
   * When he says something out loud, and when he just stands there.
   *
   * The day screen already prints the mood in the overview card, so a bubble
   * repeating it word for word is the companion talking over the page. He
   * speaks up for the two things no screen states on its own — a dose whose
   * time has passed, a diary gap in the evening — and for the one nutrient
   * verdict worth interrupting for, a measured value above a limit. Otherwise
   * the sentence stays one tap away in the sheet, and he is simply present.
   *
   * The mood is still carried in words either way: it is the `aria-label` on
   * the trigger, and it is the first line of the panel.
   */
  const speaksUp =
    data.agenda.primary.topic !== 'ernaehrung' ||
    data.state.mood === 'concerned';

  return (
    <MascotDockFrame
      mood={data.state.mood}
      pulse={data.pulse}
      label={label}
      logDate={data.logDate}
      chip={
        speaksUp ? (
          <p className="text-xs leading-snug text-fg">
            {headlineOf(data.agenda.primary)}
          </p>
        ) : null
      }
      panel={
        <div className="space-y-4 pb-2">
          <NotePanel note={data.agenda.primary} mood={mood} />
          {data.agenda.more.map((note) => (
            <NotePanel key={note.topic} note={note} mood={mood} muted />
          ))}
          <p className="text-xs text-muted">
            Orson steht in der Ecke, solange du ihn dort haben willst — der
            Schalter dafür liegt unter{' '}
            <Link href="/settings" className="text-primary-strong">
              Mehr
            </Link>
            .
          </p>
        </div>
      }
    />
  );
}

/** Every link names where it goes; "Dorthin" tells nobody anything. */
const ANCHOR_LABEL: Record<NonNullable<CompanionNote['anchor']>, string> = {
  '#mahlzeiten': 'Zu den Mahlzeiten',
  '#medikamente': 'Zu den Medikamenten',
  '#tagescheck': 'Zum Tagescheck',
};

/**
 * One topic in the sheet.
 *
 * The nutrient topic has no `noteCopy` of its own — its sentence comes from
 * `mascotCopy`, because there is exactly one place in this app that phrases a
 * verdict about food and it is not here.
 */
function NotePanel({
  note,
  mood,
  muted = false,
}: {
  note: CompanionNote;
  mood: ReturnType<typeof mascotCopy>;
  muted?: boolean;
}) {
  const copy = noteCopy(note);
  const headline = copy?.headline ?? mood.headline;
  const detail = copy?.detail ?? mood.detail;

  return (
    <section>
      {/* The mood word, wherever the nutrient topic ends up in the order. Not
       * conditional on rank: it is the one thing the drawing alone must never
       * be left to say. */}
      {note.topic === 'ernaehrung' ? (
        <p className="text-eyebrow uppercase text-muted">{mood.moodLabel}</p>
      ) : null}
      <p className={muted ? 'text-sm text-fg' : 'text-sm font-medium text-fg'}>
        {headline}
      </p>
      {detail ? <p className="mt-0.5 text-xs text-muted">{detail}</p> : null}

      {note.topic === 'ernaehrung' && mood.stepText ? (
        <p className="mt-1 text-xs text-muted">{mood.stepText}</p>
      ) : null}

      {note.anchor ? (
        <Link
          href={`/${note.anchor}`}
          className="mt-1 inline-flex min-h-11 items-center text-xs font-medium text-primary-strong"
        >
          {ANCHOR_LABEL[note.anchor]}
        </Link>
      ) : null}

      {note.topic === 'ernaehrung' && mood.bondText ? (
        <p className="mt-1 text-xs text-muted">{mood.bondText}</p>
      ) : null}
    </section>
  );
}
