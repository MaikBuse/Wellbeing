import { BrandBlock, BrandScreen } from '@/components/brand/brand-screen';

export const metadata = { title: 'Keine Verbindung – Wellbeing' };

/**
 * Served by the service worker when a navigation fails. Deliberately outside
 * the (app) group so it needs no session and no database.
 */
export default function OfflinePage() {
  return (
    <BrandScreen dimLogo>
      <BrandBlock step={1} className="space-y-2">
        <h1 className="text-title text-balance text-fg">Keine Verbindung</h1>
        <p className="text-pretty text-muted">
          Wellbeing läuft im Heimnetz. Von unterwegs muss die VPN-Verbindung
          aktiv sein.
        </p>
      </BrandBlock>

      <BrandBlock step={2}>
        <p className="text-sm text-muted">
          Sobald die Verbindung wieder steht, einfach neu laden.
        </p>
      </BrandBlock>
    </BrandScreen>
  );
}
