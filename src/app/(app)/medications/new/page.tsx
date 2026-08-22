import { requireUser } from '@/auth.helpers';
import { getUserSettings } from '@/db/queries/users';
import { MedicationForm } from '@/components/medication/medication-form';
import { PageHeader } from '@/components/ui/page-header';
import { todayLogDate } from '@/lib/time';

export const metadata = { title: 'Medikament anlegen – Wellbeing' };

export default async function NewMedicationPage() {
  const user = await requireUser();
  const settings = await getUserSettings(user.id);
  return (
    <main className="space-y-4 p-4">
      <PageHeader title="Medikament anlegen" />
      <MedicationForm
        today={todayLogDate(settings.timeZone, settings.dayStartHour)}
      />
    </main>
  );
}
