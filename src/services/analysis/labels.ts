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
};

/**
 * The reliability axis, kept separate from the verdict on purpose.
 *
 * A verdict says what the data shows; this says how much data there is. Putting
 * a word like "vorläufig" into the verdict chip would merge the two, which is
 * the confusion the whole split exists to avoid.
 */
export const RELIABILITY_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: 'sehr grob',
  2: 'grob',
  3: 'vorläufig',
  4: 'belastbar',
};

export const STATUS_SECTION_LABELS = {
  confirmatory: 'Belastbar',
  provisional: 'Vorläufig',
  not_computable: 'Noch keine Vergleichsdaten',
} as const;

export const PROVISIONAL_NOTICE =
  'Diese Zahlen sind gerechnet, aber noch nicht gegengerechnet — dafür fehlen Daten. Deshalb steht hier kein Urteil, nur der Zwischenstand.';

export const PROVISIONAL_ORDER_NOTICE =
  'Sortiert danach, was am nächsten dran ist — nicht nach Effektstärke. Bei wenigen Beobachtungen springt die Effektstärke in groben Stufen und würde das Zufälligste nach oben spülen.';

export const NOT_COMPUTABLE_NOTICE =
  'Hier lässt sich noch kein Vergleich rechnen: es fehlt eine der beiden Seiten. Fehlende Daten heißen nicht „unbedenklich“.';

export const DATA_BASIS_NOTICE =
  'Alles ist ab dem ersten Tag zu sehen. Wie viel dahinter steckt, steht bei jedem Faktor daneben.';

/**
 * Why a provisional row shows counts but no range.
 *
 * The reason is worth stating rather than leaving a gap: the block bootstrap
 * resamples days, and one exposed day cannot move — so an interval there would
 * describe the other arm and read as precise.
 */
export const NO_INTERVAL_NOTICE =
  'Für einen Bereich sind es noch zu wenige verschiedene Tage. Aus einem einzelnen Tag ließe sich einer berechnen, aber er würde eine Genauigkeit behaupten, die nicht da ist.';

export const BALANCE_NOTE_LABELS = {
  no_variation: 'keine Streuung',
  separated: 'vollständig getrennt',
} as const;

export const SEPARATED_NOTICE =
  'An den Tagen mit diesem Faktor war das durchweg anders als an den Tagen ohne. Stärker kann eine Vermischung nicht sein — hier lässt sich beides nicht trennen.';

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

/** "11 von 25 Tagen mit diesem Merkmal" — the gate that caps the score. */
export function formatGateProgress(
  bindingLabel: string,
  have: number,
  need: number
): string {
  return `${have} von ${need} ${bindingLabel}`;
}

/** The global data basis, for the banner above everything. */
export function formatDataBasis(trackedDays: number, need: number): string {
  if (trackedDays >= need) {
    return `Datenbasis: ${trackedDays} erfasste Tage — genug für belastbare Aussagen.`;
  }
  return `Datenbasis: ${trackedDays} von ${need} erfassten Tagen.`;
}

/** "3 von 4 Voraussetzungen erfüllt" — how many, not just how far. */
export function formatGatesMet(met: number, total: number): string {
  return `${met} von ${total} Voraussetzungen erfüllt`;
}

/** How many provisional factors sit below the confirmatory ones. */
export function formatProvisionalCount(count: number): string {
  if (count === 0) return '';
  return count === 1
    ? 'dazu 1 vorläufiger Faktor, der noch zu wenig Daten hat'
    : `dazu ${count} vorläufige Faktoren, die noch zu wenig Daten haben`;
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
