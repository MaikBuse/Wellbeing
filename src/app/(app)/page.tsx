import { ViewTransition } from 'react';
import { requireUser } from '@/auth.helpers';
import { getUserSettings } from '@/db/queries/users';
import { DateStepper } from '@/components/day/date-stepper';
import { DayView } from '@/components/day/day-view';
import { todayLogDate } from '@/lib/time';

export const metadata = { title: 'Heute – Wellbeing' };

export default async function TodayPage() {
  const user = await requireUser();
  const settings = await getUserSettings(user.id);
  const logDate = todayLogDate(settings.timeZone, settings.dayStartHour);
  return (
    // Today participates in the same directional slides so that stepping from
    // a dated day back to "Heute" moves the same way it moves elsewhere.
    <ViewTransition
      enter={{
        'nav-forward': 'nav-forward',
        'nav-back': 'nav-back',
        default: 'none',
      }}
      exit={{
        'nav-forward': 'nav-forward',
        'nav-back': 'nav-back',
        default: 'none',
      }}
      default="none"
    >
      {/* Today is the landing screen and the "Heute" tab, so it carries the
       * stepper too: since the "Tage" tab became "Analyse", this is the only
       * one-tap route to yesterday. Outside the inner ViewTransition on
       * purpose — the nav row should not join the content reveal. */}
      <DateStepper logDate={logDate} isToday />
      <ViewTransition
        // 'none' for the nav types on purpose: otherwise a directional slide
        // and this reveal would both animate the same element.
        enter={{
          'nav-forward': 'none',
          'nav-back': 'none',
          default: 'content-in',
        }}
        default="none"
      >
        <DayView logDate={logDate} />
      </ViewTransition>
    </ViewTransition>
  );
}
