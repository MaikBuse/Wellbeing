import { requireUser } from '@/auth.helpers';
import { allTagDefs } from '@/db/queries/foods';
import { FoodForm } from '@/components/food-picker/food-form';
import { PageHeader } from '@/components/ui/page-header';

export const metadata = { title: 'Neues Lebensmittel – Wellbeing' };

export default async function NewFoodPage({
  searchParams,
}: {
  searchParams: Promise<{ barcode?: string }>;
}) {
  await requireUser();
  const { barcode } = await searchParams;
  const tags = await allTagDefs();

  return (
    <main className="space-y-4 p-4">
      <PageHeader title="Neues Lebensmittel" />
      <FoodForm
        defaultBarcode={barcode}
        tags={tags.map((tag) => ({
          id: tag.id,
          labelDe: tag.labelDe,
          category: tag.category,
        }))}
      />
    </main>
  );
}
