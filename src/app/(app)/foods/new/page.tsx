import { requireUser } from '@/auth.helpers';
import { allTagDefs } from '@/db/queries/foods';
import { FoodForm } from '@/components/food-picker/food-form';

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
      <h1 className="pt-2 text-xl font-semibold text-fg">Neues Lebensmittel</h1>
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
