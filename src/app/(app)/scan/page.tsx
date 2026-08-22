import { BarcodeScanner } from '@/components/scanner/barcode-scanner';
import { PageHeader } from '@/components/ui/page-header';

export const metadata = { title: 'Scannen – Wellbeing' };

export default function ScanPage() {
  return (
    <main className="space-y-4 p-4">
      <PageHeader title="Scannen" description="Barcode scannen und das Lebensmittel übernehmen." />
      <BarcodeScanner />
    </main>
  );
}
