import Link from 'next/link';
import { requireUser } from '@/auth.helpers';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardMeta, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { SectionLabel } from '@/components/ui/section-label';
import { GoalRow } from '@/components/nutrition/goal-row';
import { NUTRIENT_META, type NutrientGroup } from '@/lib/nutrients';
import { GROUP_LABEL } from '@/lib/nutrition-goals';
import { formatGermanNumber } from '@/lib/nutrition';
import { supplementCandidates } from '@/db/queries/nutrition';
import { SupplementMapping } from '@/components/nutrition/supplement-mapping';
import { loadTargets } from '@/services/nutrition/loader';
import { targetDisplayOrder } from '@/services/nutrition/targets/derive';

export const metadata = { title: 'Nährstoff-Ziele – Wellbeing' };

export default async function NutritionGoalsPage() {
  const user = await requireUser();
  const [set, candidates] = await Promise.all([
    loadTargets(user.id),
    supplementCandidates(user.id),
  ]);

  const keys = targetDisplayOrder([...set.targets.keys()]);
  const grouped = new Map<NutrientGroup, typeof keys>();
  for (const key of keys) {
    const group = NUTRIENT_META[key].group;
    const list = grouped.get(group);
    if (list) list.push(key);
    else grouped.set(group, [key]);
  }

  const missing = missingAnswers(set);
  const overridden = new Set(set.overriddenKeys);

  return (
    <main className="space-y-4 p-4">
      <PageHeader
        eyebrow="Einstellungen"
        title="Nährstoff-Ziele"
        description="Orientierungswerte, abgeleitet aus deinem Profil."
      />

      <Card>
        <CardHeader
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/nutrition-goals/profile">Profil</Link>
            </Button>
          }
        >
          <CardTitle>
            {set.blocked === null ? 'Ziele aktiv' : 'Noch nicht aktiv'}
          </CardTitle>
          <CardMeta>{statusLine(set, missing)}</CardMeta>
        </CardHeader>
      </Card>

      {set.targets.size === 0 ? (
        <Card>
          <CardMeta>
            Sobald Geschlecht, Geburtsjahr, Größe und Gewicht im Profil stehen,
            erscheinen hier die abgeleiteten Werte.
          </CardMeta>
        </Card>
      ) : (
        [...grouped.entries()].map(([group, groupKeys]) => (
          <Card key={group}>
            <SectionLabel>{GROUP_LABEL[group]}</SectionLabel>
            <div className="mt-2">
              {groupKeys.map((key) => (
                <GoalRow
                  key={key}
                  nutrientKey={key}
                  target={set.targets.get(key)!}
                  overridden={overridden.has(key)}
                />
              ))}
            </div>
          </Card>
        ))
      )}

      <Card>
        <CardHeader>
          <CardTitle>Präparate</CardTitle>
          <CardMeta>
            Ein zugeordnetes Präparat zählt auf das Ziel, sobald die Einnahme
            abgehakt ist — und wird im Balken getrennt ausgewiesen, damit
            sichtbar bleibt, woher der Wert kommt. Eine fällige, aber nicht
            abgehakte Dosis zählt nicht.
          </CardMeta>
        </CardHeader>
        <div className="mt-2">
          <SupplementMapping candidates={candidates} />
        </div>
      </Card>

      <Card>
        <CardTitle>Was hier fehlt</CardTitle>
        <CardMeta className="mt-1">
          Selen fehlt in dieser Liste, weil der Bundeslebensmittelschlüssel es
          nicht führt. Ein Ziel, das sich aus den vorhandenen Daten nicht messen
          lässt, wird hier nicht angeboten.
        </CardMeta>
      </Card>
    </main>
  );
}

/**
 * The `missingLabels` shape from the completeness blocks, for a profile.
 *
 * The weight belongs in here even though it is not a column of the
 * questionnaire: without it there is no energy target and no protein target,
 * which is half of what the day screen shows.
 */
function missingAnswers(
  set: Awaited<ReturnType<typeof loadTargets>>
): string[] {
  const profile = set.profile;
  if (!profile) return ['Geschlecht', 'Geburtsjahr', 'Größe', 'Gewicht'];
  const missing: string[] = [];
  if (profile.referenceSex === null) missing.push('Referenzwerte nach');
  if (profile.birthYear === null) missing.push('Geburtsjahr');
  if (profile.heightCm === null) missing.push('Größe');
  if (set.weightKg === null) missing.push('Gewicht');
  return missing;
}

function statusLine(
  set: Awaited<ReturnType<typeof loadTargets>>,
  missing: string[]
): string {
  if (set.blocked === 'kein_profil') {
    return 'Das Profil ist noch leer. Die Zielwerte entstehen daraus.';
  }
  if (missing.length > 0) {
    const consequence = missing.includes('Gewicht')
      ? ' Ohne Gewicht gibt es kein Energie- und kein Eiweißziel.'
      : '';
    return `Es fehlen noch: ${missing.join(', ')}.${consequence}`;
  }
  const parts: string[] = [];
  if (set.weightKg !== null) {
    parts.push(`${formatGermanNumber(set.weightKg, 1)} kg`);
  }
  if (set.profile) parts.push(dietLabel(set.profile.dietForm));
  if (set.steroidLongTerm) parts.push('dauerhaft Kortison');
  return parts.length > 0 ? `Grundlage: ${parts.join(' · ')}.` : 'Ziele aktiv.';
}

function dietLabel(form: string): string {
  if (form === 'vegan') return 'vegan';
  if (form === 'vegetarian') return 'vegetarisch';
  if (form === 'pescetarian') return 'pescetarisch';
  return 'omnivor';
}
