import type { SourceKey } from './types';

/**
 * Where a target number comes from, in the words of whoever published it.
 *
 * Every target carries at least one of these keys and the UI prints the
 * citation next to the value. That is not decoration: a number like "50 mg of
 * arachidonic acid" is only trustworthy if the reader can see whose number it
 * is, and the app is otherwise careful never to sound like a prescription.
 */
export type Source = {
  labelDe: string;
  citation: string;
  year: number;
  /** How strong the evidence is, said plainly. Shown verbatim. */
  strengthDe: string;
};

export const SOURCES: Record<SourceKey, Source> = {
  dach: {
    labelDe: 'D-A-CH-Referenzwerte',
    citation:
      'DGE, ÖGE, SGE: Referenzwerte für die Nährstoffzufuhr, 2. Auflage, 8. aktualisierte Ausgabe',
    year: 2024,
    strengthDe:
      'Referenzwerte für gesunde Erwachsene. Sie beschreiben, was die Zufuhr bei fast allen Menschen deckt — keine Zielwerte für eine Erkrankung.',
  },
  dge_fiber: {
    labelDe: 'DGE — Ballaststoffe',
    citation: 'DGE: Referenzwert Ballaststoffe, 30 g/Tag für Erwachsene',
    year: 2024,
    strengthDe:
      'Richtwert. Bei RA kommt ein zweites Argument dazu: Interventionen über 30 Tage mit hoher Ballaststoffzufuhr senkten entzündungsfördernde Zytokine. Kleine Studien, kurze Dauer.',
  },
  dge_rheuma_aa: {
    labelDe: 'DGE — Arachidonsäure bei entzündlich-rheumatischen Erkrankungen',
    citation:
      'Empfehlung, die Zufuhr von Arachidonsäure auf höchstens 50 mg/Tag zu begrenzen',
    year: 2010,
    strengthDe:
      'Fachgesellschaftliche Empfehlung, mechanistisch begründet: Arachidonsäure ist die Vorstufe von Prostaglandin E2 und Leukotrien B4. Sie stammt fast nur aus tierischen Lebensmitteln.',
  },
  who_salt: {
    labelDe: 'WHO — Natrium',
    citation: 'WHO guideline: sodium intake for adults, < 2 g Natrium (5 g Salz) pro Tag',
    year: 2012,
    strengthDe:
      'Starke Empfehlung, begründet über Blutdruck. Der RA-Bezug ist zusätzlich und schwächer: Kochsalz verschiebt im Labor und im Tiermodell die Th17-Differenzierung. Studien am Menschen mit RA-Endpunkten gibt es kaum.',
  },
  who_sugar: {
    labelDe: 'WHO — freie Zucker',
    citation: 'WHO guideline: sugars intake for adults and children, < 10 % der Energie',
    year: 2015,
    strengthDe:
      'Starke Empfehlung. Der BLS misst Gesamtzucker, nicht freien Zucker — der Wert liegt deshalb systematisch über dem, was die Empfehlung meint.',
  },
  efsa_epa_dha: {
    labelDe: 'EFSA — EPA und DHA',
    citation: 'EFSA NDA Panel: Dietary Reference Values for fats, AI 250 mg EPA+DHA',
    year: 2010,
    strengthDe:
      'Referenzwert für Gesunde, hergeleitet aus der Prävention von Herz-Kreislauf-Erkrankungen. Für RA werden deutlich höhere Mengen untersucht.',
  },
  eular_lifestyle: {
    labelDe: 'EULAR — Lebensstil bei rheumatischen Erkrankungen',
    citation:
      '2021 EULAR recommendations regarding lifestyle behaviours and work participation',
    year: 2021,
    strengthDe:
      'Omega-3 bei rheumatoider Arthritis ist dort als „moderate evidence of a small effect" eingestuft — die einzige Ernährungsexposition mit diesem Rang. Ein kleiner Effekt, kein Ersatz für Medikamente.',
  },
  acr_giop: {
    labelDe: 'ACR — glukokortikoid-induzierte Osteoporose',
    citation:
      '2022 ACR Guideline for the Prevention and Treatment of Glucocorticoid-Induced Osteoporosis',
    year: 2022,
    strengthDe:
      'Bedingte Empfehlung: unter dauerhafter Kortisontherapie mindestens 1200 mg Calcium und 800–1000 IE Vitamin D täglich, zusammen mit Bewegung.',
  },
  ra_protein: {
    labelDe: 'Eiweiß bei rheumatoider Arthritis',
    citation:
      'Narrative Übersicht zur Ernährung bei RA: 1,0–1,2 g/kg zur Sarkopenie-Prävention, 1,5 g/kg bei manifester Sarkopenie',
    year: 2021,
    strengthDe:
      'Übersichtsarbeit, keine Interventionsstudie. Hintergrund: 25–43 % der Menschen mit RA sind sarkopen, und der Eiweißbedarf liegt dadurch über dem allgemeinen Referenzwert.',
  },
  ra_vitamin_e: {
    labelDe: 'Vitamin E bei rheumatoider Arthritis',
    citation:
      'Metaanalyse randomisierter Studien zu Vitamin E bei RA; in der Literatur genannte Dosen 100–200 IE/Tag',
    year: 2022,
    strengthDe:
      'Hinweise auf einen Effekt bei druckschmerzhaften und geschwollenen Gelenken, heterogene Studienlage. Oberhalb von 400 IE wird ausdrücklich abgeraten.',
  },
  mifflin: {
    labelDe: 'Mifflin-St Jeor',
    citation:
      'Mifflin MD et al.: A new predictive equation for resting energy expenditure in healthy individuals',
    year: 1990,
    strengthDe:
      'Schätzgleichung, von der Academy of Nutrition and Dietetics als Standard für den Ruheumsatz benannt. Sie trifft bei etwa 70 % der Menschen auf 10 % genau — eine Schätzung, keine Messung.',
  },
};
