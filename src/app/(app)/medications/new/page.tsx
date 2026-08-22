import { requireUser } from '@/auth.helpers';
import { MedicationForm } from '@/components/medication/medication-form';

export const metadata = { title: 'Medikament anlegen – Wellbeing' };

export default async function NewMedicationPage() {
  await requireUser();
  return (
    <main className="space-y-4 p-4">
      <h1 className="pt-2 text-xl font-semibold text-fg">Medikament anlegen</h1>
      <MedicationForm />
    </main>
  );
}
