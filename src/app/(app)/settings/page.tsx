import { signOut } from '@/auth';
import { requireUser } from '@/auth.helpers';
import { getUserSettings } from '@/db/queries/users';
import { Button } from '@/components/ui/button';
import { Card, CardMeta, CardTitle } from '@/components/ui/card';
import { InstallPrompt } from '@/components/pwa/install-prompt';

export const metadata = { title: 'Einstellungen – Wellbeing' };

export default async function SettingsPage() {
  const user = await requireUser();
  const settings = await getUserSettings(user.id);

  return (
    <main className="space-y-4 p-4">
      <h1 className="pt-2 text-xl font-semibold text-fg">Einstellungen</h1>

      <Card>
        <CardTitle>Angemeldet</CardTitle>
        <CardMeta className="mt-1">{user.name ?? user.email ?? '–'}</CardMeta>
        <form
          className="mt-3"
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/signin' });
          }}
        >
          <Button type="submit" variant="outline" size="sm">
            Abmelden
          </Button>
        </form>
      </Card>

      <Card>
        <CardTitle>App installieren</CardTitle>
        <div className="mt-3">
          <InstallPrompt />
        </div>
      </Card>

      <Card>
        <CardTitle>Zeitrechnung</CardTitle>
        <CardMeta className="mt-1">
          Ein Tag läuft von {String(settings.dayStartHour).padStart(2, '0')}:00
          bis {String(settings.dayStartHour).padStart(2, '0')}:00 Uhr (
          {settings.timeZone}). Ein Abendessen um 23:30 zählt damit zum
          richtigen Tag, ein Symptom um 01:00 noch zum Tag davor.
        </CardMeta>
      </Card>

      <Card>
        <CardTitle>Was diese App nicht ist</CardTitle>
        <CardMeta className="mt-1">
          Wellbeing sammelt deine eigenen Beobachtungen. Sie stellt keine
          Diagnose und ersetzt keine ärztliche Beratung. Änderungen an Ernährung
          oder Medikation bitte nur in Absprache mit deiner Ärztin.
        </CardMeta>
      </Card>
    </main>
  );
}
