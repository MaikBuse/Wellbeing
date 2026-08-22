import Link from 'next/link';
import { BrandBlock, BrandScreen } from '@/components/brand/brand-screen';
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
    <BrandScreen>
      <BrandBlock step={1} className="space-y-2">
        <h1 className="text-title text-balance text-fg">{content.title}</h1>
        <p className="text-pretty text-muted">{content.body}</p>
      </BrandBlock>

      <BrandBlock step={2}>
        <Button asChild variant="outline">
          <Link href="/signin">Zurück zur Anmeldung</Link>
        </Button>
      </BrandBlock>
    </BrandScreen>
  );
}
