import { ViewTransition } from 'react';
import { notFound } from 'next/navigation';
import { DateStepper } from '@/components/day/date-stepper';
import { DayView } from '@/components/day/day-view';

export const metadata = { title: 'Tag – Wellbeing' };

export default async function DayPage({
  params,
}: {
  // Next 16: params is async.
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  return (
    // The wrapper belongs in the page, not the layout: layouts persist across
    // navigation, so enter/exit would never fire there.
    // default="none" keeps this from animating on unrelated transitions, such
    // as a browser back button or a router.refresh().
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
      <DateStepper logDate={date} />
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
        <DayView logDate={date} />
      </ViewTransition>
    </ViewTransition>
  );
}
