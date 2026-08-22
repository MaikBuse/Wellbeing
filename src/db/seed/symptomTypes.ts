export type SymptomSeed = {
  key: string;
  labelDe: string;
  groupKey: string;
  isRedFlag?: boolean;
};

/**
 * The list is deliberately broad: a symptom that has no button does not get
 * logged, and a missing symptom is invisible to the analysis forever.
 *
 * Red flags are not analysis material — they trigger an emergency notice.
 */
export const SYMPTOM_TYPES: SymptomSeed[] = [
  // Magen & Darm
  { key: 'bloating', labelDe: 'Blähbauch / Völlegefühl', groupKey: 'gi' },
  { key: 'flatulence', labelDe: 'Blähungen', groupKey: 'gi' },
  { key: 'abdominal_pain', labelDe: 'Bauchschmerzen', groupKey: 'gi' },
  { key: 'cramps', labelDe: 'Bauchkrämpfe', groupKey: 'gi' },
  { key: 'diarrhea', labelDe: 'Durchfall', groupKey: 'gi' },
  { key: 'constipation', labelDe: 'Verstopfung', groupKey: 'gi' },
  { key: 'urgency', labelDe: 'Plötzlicher Stuhldrang', groupKey: 'gi' },
  { key: 'nausea', labelDe: 'Übelkeit', groupKey: 'gi' },
  { key: 'heartburn', labelDe: 'Sodbrennen', groupKey: 'gi' },
  { key: 'belching', labelDe: 'Aufstoßen', groupKey: 'gi' },
  { key: 'borborygmi', labelDe: 'Darmgeräusche', groupKey: 'gi' },

  // Allgemein
  { key: 'fatigue', labelDe: 'Erschöpfung / Fatigue', groupKey: 'systemic' },
  { key: 'brain_fog', labelDe: 'Konzentrationsstörung', groupKey: 'systemic' },
  { key: 'headache', labelDe: 'Kopfschmerzen', groupKey: 'systemic' },
  { key: 'migraine', labelDe: 'Migräne', groupKey: 'systemic' },
  { key: 'dizziness', labelDe: 'Schwindel', groupKey: 'systemic' },
  { key: 'palpitations', labelDe: 'Herzrasen', groupKey: 'systemic' },
  { key: 'sweating', labelDe: 'Schweißausbrüche', groupKey: 'systemic' },
  { key: 'chills', labelDe: 'Frösteln / Schüttelfrost', groupKey: 'systemic' },
  { key: 'feverish', labelDe: 'Fieberähnliches Gefühl', groupKey: 'systemic' },
  { key: 'sleep_disturbance', labelDe: 'Schlafstörung', groupKey: 'systemic' },
  { key: 'restlessness', labelDe: 'Innere Unruhe', groupKey: 'systemic' },
  { key: 'low_mood', labelDe: 'Gedrückte Stimmung', groupKey: 'systemic' },

  // Gelenke & Muskeln
  { key: 'joint_pain', labelDe: 'Gelenkschmerzen', groupKey: 'msk' },
  { key: 'joint_swelling', labelDe: 'Gelenkschwellung', groupKey: 'msk' },
  { key: 'joint_stiffness', labelDe: 'Gelenksteifigkeit', groupKey: 'msk' },
  { key: 'muscle_pain', labelDe: 'Muskelschmerzen', groupKey: 'msk' },
  { key: 'tendon_pain', labelDe: 'Sehnenschmerzen', groupKey: 'msk' },
  {
    key: 'weak_grip',
    labelDe: 'Kraftlosigkeit in den Händen',
    groupKey: 'msk',
  },

  // Haut & Schleimhaut
  { key: 'itching', labelDe: 'Juckreiz', groupKey: 'skin' },
  { key: 'flush', labelDe: 'Hautrötung / Flush', groupKey: 'skin' },
  { key: 'hives', labelDe: 'Nesselsucht / Quaddeln', groupKey: 'skin' },
  { key: 'eczema', labelDe: 'Hautausschlag / Ekzem', groupKey: 'skin' },
  { key: 'mouth_ulcers', labelDe: 'Aphthen im Mund', groupKey: 'skin' },
  {
    key: 'lip_tingling',
    labelDe: 'Kribbeln an Lippen / Zunge',
    groupKey: 'skin',
  },
  {
    key: 'swelling_face',
    labelDe: 'Schwellung im Gesicht / an den Lippen',
    groupKey: 'skin',
    isRedFlag: true,
  },

  // Atemwege
  { key: 'runny_nose', labelDe: 'Fließschnupfen', groupKey: 'airway' },
  { key: 'nasal_congestion', labelDe: 'Verstopfte Nase', groupKey: 'airway' },
  { key: 'sneezing', labelDe: 'Niesreiz', groupKey: 'airway' },
  {
    key: 'watery_eyes',
    labelDe: 'Tränende / juckende Augen',
    groupKey: 'airway',
  },
  { key: 'cough', labelDe: 'Reizhusten', groupKey: 'airway' },
  {
    key: 'throat_tightness',
    labelDe: 'Engegefühl im Hals',
    groupKey: 'airway',
    isRedFlag: true,
  },
  {
    key: 'shortness_of_breath',
    labelDe: 'Atemnot',
    groupKey: 'airway',
    isRedFlag: true,
  },

  // Sonstiges
  { key: 'tinnitus', labelDe: 'Ohrgeräusche', groupKey: 'other' },
  { key: 'water_retention', labelDe: 'Wassereinlagerung', groupKey: 'other' },
  { key: 'eye_dryness', labelDe: 'Trockene Augen', groupKey: 'other' },
  { key: 'mouth_dryness', labelDe: 'Trockener Mund', groupKey: 'other' },
];

export const RED_FLAG_NOTICE =
  'Bei Atemnot oder Engegefühl im Hals: sofort 112 anrufen. ' +
  'Diese App ist kein Notfallwerkzeug.';
