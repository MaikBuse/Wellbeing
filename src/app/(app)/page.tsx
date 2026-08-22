import { requireUser } from '@/auth.helpers';
import { getUserSettings } from '@/db/queries/users';
import { DayView } from '@/components/day/day-view';
import { todayLogDate } from '@/lib/time';

export const metadata = { title: 'Heute – Wellbeing' };

export default async function TodayPage() {
  const user = await requireUser();
  const settings = await getUserSettings(user.id);
  return (
    <DayView logDate={todayLogDate(settings.timeZone, settings.dayStartHour)} />
  );
}
