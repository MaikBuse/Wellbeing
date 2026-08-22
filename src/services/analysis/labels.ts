/**
 * Every German string the analysis produces.
 *
 * Collected in one file so that the ban on the word "signifikant" is
 * enforceable — a test reads this directory and asserts it never appears. The
 * ban is not squeamishness: "significant" invites a reader to hear "proven",
 * and nothing here proves anything. What the numbers support is "this is worth
 * testing next", and the wording has to say exactly that much and no more.
 */
import { formatGermanNumber } from '@/lib/nutrition';
import type { FindingLabel } from './types';

export const FINDING_LABELS: Record<FindingLabel, string> = {
  clear: 'deutlicher Zusammenhang',
  possible: 'möglicher Zusammenhang',
  no_signal: 'kein Hinweis',
  not_yet: 'noch nicht auswertbar',
};

export const FAMILY_LABELS = {
  food_tag: 'Ernährung',
  confounder: 'Störfaktor',
} as const;

export const MEASUREMENT_BASIS_LABELS = {
  measured: 'gemessen',
  rule: 'aus Namensregel',
  self_reported: 'selbst erfasst',
} as const;

export const MEASUREMENT_BASIS_HINTS = {
  measured:
    'Der Gehalt steht als Messwert im Bundeslebensmittelschlüssel, nicht aus dem Namen geraten.',
  rule: 'Aus dem Namen und der Zutatenliste abgeleitet — für diesen Stoff gibt es keine Messwerte.',
  self_reported: 'Aus deinen eigenen Tageseinträgen.',
} as const;

/** The standing disclaimer. Never omitted, never softened. */
export const CORRELATION_NOTICE = 'Zusammenhang, nicht Ursache.';

export const NOT_A_DIAGNOSIS =
  'Diese Auswertung stellt keine Diagnose. Änderungen an Ernährung oder Medikation gehören in die Hand der behandelnden Ärztin.';

export const RA_INDEX_NOTICE =
  'Der RA-Tageswert ist ein eigener Wert aus deinen fünf Tageseinträgen. Er ist kein DAS28 und kein medizinisch geprüfter Score — ohne Blutwerte lässt sich der nicht berechnen.';

export const OVERFITTING_NOTICE =
  'Ein Ergebnis, das über mehrere Wochen oben bleibt, ist mehr wert als das Ergebnis eines einzelnen Durchlaufs. Deshalb steht bei jedem Faktor, wie lange er sich schon hält.';

export const FDR_SCOPE_NOTICE =
  'Ernährung und Störfaktoren werden getrennt gegengerechnet, nicht gemeinsam. Sonst würde ein starker Störfaktor alle Ernährungsbefunde verdrängen.';

export const SAME_DAY_NOTICE =
  'Gleicher Tag — keine Richtungsaussage möglich. Beides ist am selben Abend eingetragen worden.';

export const DESCRIPTIVE_NOTICE = 'Beschreibend, nicht gegengerechnet.';

/** Effect in percentage points, e.g. "+18 Prozentpunkte". */
export function formatRiskDifference(pointPp: number): string {
  const sign = pointPp > 0 ? '+' : '';
  return `${sign}${formatGermanNumber(round(pointPp, 0))} Prozentpunkte`;
}

/** Effect in RA-index points, e.g. "+0,6 Punkte". */
export function formatIndexPoints(point: number): string {
  const sign = point > 0 ? '+' : '';
  return `${sign}${formatGermanNumber(round(point, 1))} Punkte`;
}

export function formatInterval(
  low: number,
  high: number,
  unit: 'pp' | 'points'
): string {
  const decimals = unit === 'pp' ? 0 : 1;
  const lowText = `${low > 0 ? '+' : ''}${formatGermanNumber(round(low, decimals))}`;
  const highText = `${high > 0 ? '+' : ''}${formatGermanNumber(round(high, decimals))}`;
  const suffix = unit === 'pp' ? 'Prozentpunkten' : 'Punkten';
  return `zwischen ${lowText} und ${highText} ${suffix}`;
}

export function formatMealCounts(
  labelDe: string,
  exposedNotable: number,
  exposedMeals: number,
  unexposedNotable: number,
  unexposedMeals: number
): string {
  return `${exposedNotable} von ${exposedMeals} Mahlzeiten mit ${labelDe} · ${unexposedNotable} von ${unexposedMeals} ohne`;
}

export function formatDayCounts(exposedDays: number, unexposedDays: number): string {
  return `${exposedDays} Tage mit, ${unexposedDays} Tage ohne`;
}

/**
 * The q-value, spelled out. A bare "q = 0,08" means nothing to a reader; the
 * sentence is what makes the number honest.
 */
export function formatQValue(q: number): string {
  const percent = Math.round(q * 100);
  return `Falsch-Entdeckungs-Rate q = ${formatGermanNumber(round(q, 2))} — von 100 solchen Auswertungen wären etwa ${percent} ein Zufallsfund.`;
}

export function formatStability(weeks: number): string | null {
  if (weeks < 2) return null;
  return `seit ${weeks} Wochen unter den ersten fünf`;
}

export function formatShortfall(
  labelDe: string,
  need: number,
  have: number,
  unitDe: string
): string {
  const missing = Math.max(0, need - have);
  return `${labelDe} — noch nicht auswertbar. Es fehlen noch ${missing} ${unitDe} (${have} von ${need}).`;
}

export function formatCollinearity(otherLabel: string, overlap: number): string {
  const percent = Math.round(overlap * 100);
  return `Tritt an ${percent} % der Tage gemeinsam mit ${otherLabel} auf — beide lassen sich hier nicht trennen.`;
}

export function formatImbalance(factorLabel: string, otherLabel: string): string {
  return `An den Tagen mit ${factorLabel} war auch ${otherLabel} deutlich anders. Beides lässt sich hier nicht trennen.`;
}

export function formatDoseGateFailure(sharePercent: number): string {
  return `Für eine Dosis-Aussage fehlen Mengenangaben (${sharePercent} % der Gramm sind Standardmengen).`;
}

export function formatFlareExclusion(count: number): string {
  return `${count} Schubtage sind nicht in die Bewertung eingegangen.`;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
