import { requireUser } from '@/auth.helpers';
import { MedicationForm } from '@/components/medication/medication-form';
import { PageHeader } from '@/components/ui/page-header';

export const metadata = { title: 'Medikament anlegen – Wellbeing' };

export default async function NewMedicationPage() {
  await requireUser();
  return (
    <main className="space-y-4 p-4">
      <PageHeader title="Medikament anlegen" />
      <MedicationForm />
    </main>
  );
}
