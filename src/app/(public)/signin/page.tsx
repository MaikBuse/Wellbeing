import { signIn } from '@/auth';
import { BrandBlock, BrandScreen } from '@/components/brand/brand-screen';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Anmelden – Wellbeing' };

export default function SignInPage() {
  return (
    <BrandScreen logoSize={88} priority>
      <BrandBlock step={1} className="space-y-2">
        <h1 className="text-display text-balance text-fg">Wellbeing</h1>
        <p className="text-pretty text-muted">
          Mahlzeiten, Symptome und Medikamente festhalten – und Zusammenhänge
          finden.
        </p>
      </BrandBlock>

      <BrandBlock step={2}>
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
      </BrandBlock>

      <BrandBlock step={3}>
        <p className="text-xs text-muted">
          Die Anmeldung läuft über den privaten Zitadel-Server im Heimnetz. Von
          unterwegs muss dafür die VPN-Verbindung aktiv sein.
        </p>
      </BrandBlock>
    </BrandScreen>
  );
}
