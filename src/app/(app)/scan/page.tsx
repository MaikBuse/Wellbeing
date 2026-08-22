import { BarcodeScanner } from '@/components/scanner/barcode-scanner';

export const metadata = { title: 'Scannen – Wellbeing' };

export default function ScanPage() {
  return (
    <main className="space-y-4 p-4">
      <h1 className="pt-2 text-xl font-semibold text-fg">Scannen</h1>
      <BarcodeScanner />
    </main>
  );
}
