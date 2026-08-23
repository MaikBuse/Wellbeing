import Link from 'next/link';
import { signOut } from '@/auth';
import { requireUser } from '@/auth.helpers';
import { getUserSettings } from '@/db/queries/users';
import { openNutritionProfile } from '@/db/queries/nutrition';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardMeta, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { InstallPrompt } from '@/components/pwa/install-prompt';
import { TrackWeightSwitch } from '@/components/settings/track-weight-switch';
import { TraceExposureSwitch } from '@/components/settings/trace-exposure-switch';

export const metadata = { title: 'Einstellungen – Wellbeing' };

export default async function SettingsPage() {
  const user = await requireUser();
  const [settings, profile] = await Promise.all([
    getUserSettings(user.id),
    openNutritionProfile(user.id),
  ]);

  const goalsStatus =
    profile === null
      ? 'none'
      : settings.nutritionAckVersion !== null &&
          settings.nutritionAckAt !== null
        ? 'active'
        : 'unconfirmed';

  return (
    <main className="space-y-4 p-4">
      <PageHeader title="Einstellungen" />

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
        <CardTitle>Erfassen</CardTitle>
        <div className="mt-3">
          <TrackWeightSwitch enabled={settings.trackWeight} />
        </div>
      </Card>

      <Card>
        <CardTitle>Auswertung</CardTitle>
        <div className="mt-3">
          <TraceExposureSwitch enabled={settings.countTraceExposure} />
        </div>
      </Card>

      <Card>
        <CardHeader
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/nutrition-goals">Öffnen</Link>
            </Button>
          }
        >
          <CardTitle>Nährstoff-Ziele</CardTitle>
          <CardMeta>
            {goalsStatus === 'active'
              ? 'Aktiv. Die Tagesansicht zeigt, wie weit du an deinen Zielwerten bist.'
              : goalsStatus === 'unconfirmed'
                ? 'Fast fertig — es fehlt nur die Bestätigung der Einordnung.'
                : 'Noch nicht eingerichtet. Ein kurzer Fragebogen leitet Zielwerte für Makro- und Mikronährstoffe ab.'}
          </CardMeta>
        </CardHeader>
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

      {/*
       * CC BY 4.0 requires naming the Max Rubner-Institut wherever the data is
       * used. This is that notice — not decoration, a licence condition.
       */}
      <Card>
        <CardTitle>Datenquellen</CardTitle>
        <CardMeta className="mt-1">
          Nährwerte und Mikronährstoffe im Katalog stammen aus dem
          Bundeslebensmittelschlüssel: Max Rubner-Institut (2025), BLS Version
          4.0, Karlsruhe (DOI 10.25826/Data20251217-134202-0), lizenziert unter
          CC BY 4.0. Angaben zu verpackten Produkten kommen von Open Food Facts
          (ODbL). Kennzeichnungen wie Histamin oder FODMAP stehen in keiner der
          beiden Quellen und werden lokal aus Regeln abgeleitet.
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

      {/*
       * No version string here on purpose. `npm_package_version` is unset in
       * the container (it runs `node server.js`, not an npm script), and the
       * version that actually identifies a deployment is the image tag, which
       * argocd-image-updater owns. A hardcoded fallback would be worse than
       * nothing.
       */}
      <div className="flex flex-col items-center gap-2 pt-4 pb-2">
        <Logo size={40} className="opacity-70" />
        <p className="text-xs text-muted">Wellbeing</p>
      </div>
    </main>
  );
}
