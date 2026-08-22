import { redirect } from 'next/navigation';
import { requireUser } from '@/auth.helpers';
import { getUserSettings } from '@/db/queries/users';
import { todayLogDate } from '@/lib/time';

/**
 * /day has no list of its own yet, so it opens today.
 *
 * It used to open *yesterday* — the theory being that someone tapping "Tage"
 * wants to complete the day just gone. In practice the day screen then showed
 * "Freitag, 21. August 2026" as its heading with nothing saying that this was
 * yesterday, and it read as the app having the wrong date. Worse, entries made
 * there were being written to today. One tap on the stepper's back arrow is a
 * much cheaper way to reach yesterday than a heading nobody can trust.
 */
export default async function DayIndexPage() {
  const user = await requireUser();
  const settings = await getUserSettings(user.id);
  redirect(`/day/${todayLogDate(settings.timeZone, settings.dayStartHour)}`);
}
