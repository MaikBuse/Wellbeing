import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Anmeldung fehlgeschlagen – Wellbeing' };

const MESSAGES: Record<string, { title: string; body: string }> = {
  AccessDenied: {
    title: 'Kein Zugriff',
    body: 'Dieses Konto ist für Wellbeing nicht freigegeben. Die Freigabe erfolgt über die Rolle im Zitadel-Projekt.',
  },
  Configuration: {
    title: 'Konfigurationsfehler',
    body: 'Die Anmeldung ist auf dem Server nicht korrekt eingerichtet. Bitte die Server-Logs prüfen.',
  },
  Verification: {
    title: 'Link abgelaufen',
    body: 'Bitte die Anmeldung erneut starten.',
  },
};

export default async function AuthErrorPage({
  searchParams,
}: {
  // Next 16: searchParams is async.
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const content = (error ? MESSAGES[error] : undefined) ?? {
    title: 'Anmeldung fehlgeschlagen',
    body: 'Bitte noch einmal versuchen.',
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-fg">{content.title}</h1>
        <p className="text-muted">{content.body}</p>
      </div>
      <Button asChild variant="outline">
        <Link href="/signin">Zurück zur Anmeldung</Link>
      </Button>
    </main>
  );
}
