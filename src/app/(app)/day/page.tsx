import { redirect } from 'next/navigation';
import { requireUser } from '@/auth.helpers';
import { getUserSettings } from '@/db/queries/users';
import { addDays, todayLogDate } from '@/lib/time';

/** /day has no list of its own yet — jump to yesterday, which is what someone
 * navigating "Tage" almost always wants to complete. */
export default async function DayIndexPage() {
  const user = await requireUser();
  const settings = await getUserSettings(user.id);
  const today = todayLogDate(settings.timeZone, settings.dayStartHour);
  redirect(`/day/${addDays(today, -1)}`);
}
