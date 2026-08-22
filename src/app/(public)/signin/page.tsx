import { signIn } from '@/auth';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Anmelden – Wellbeing' };

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-fg">Wellbeing</h1>
        <p className="text-muted">
          Mahlzeiten, Symptome und Medikamente festhalten – und Zusammenhänge
          finden.
        </p>
      </div>

      <form
        action={async () => {
          'use server';
          await signIn('zitadel', { redirectTo: '/' });
        }}
      >
        <Button type="submit" size="lg" className="w-full">
          Anmelden
        </Button>
      </form>

      <p className="text-xs text-muted">
        Die Anmeldung läuft über den privaten Zitadel-Server im Heimnetz. Von
        unterwegs muss dafür die VPN-Verbindung aktiv sein.
      </p>
    </main>
  );
}
