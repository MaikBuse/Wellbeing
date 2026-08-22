import { Logo } from '@/components/brand/logo';

export const metadata = { title: 'Keine Verbindung – Wellbeing' };

/**
 * Served by the service worker when a navigation fails. Deliberately outside
 * the (app) group so it needs no session and no database.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
      <Logo size={72} className="opacity-60" />
      <h1 className="text-2xl font-semibold text-fg">Keine Verbindung</h1>
      <p className="text-muted">
        Wellbeing läuft im Heimnetz. Von unterwegs muss die VPN-Verbindung aktiv
        sein.
      </p>
      <p className="text-sm text-muted">
        Sobald die Verbindung wieder steht, einfach neu laden.
      </p>
    </main>
  );
}
