import { NUTRIENT_META, type NutrientKey } from '@/lib/nutrients';
import {
  ageFromBirthYear,
  energyTargetKcal,
  gramsForEnergyShare,
} from './formulas';
import type { SourceKey, TargetContext, TargetDefinition, TargetValue } from './types';

/**
 * Every target the app knows, as code rather than rows.
 *
 * A target value is KNOWLEDGE, not a measurement. It belongs on the same side
 * of the asymmetry CLAUDE.md describes as `food_tag`: if a reference value is
 * corrected, the correction applies retroactively, while the intake it is
 * compared against stays the snapshot it always was. Storing these thirty-odd
 * literature constants per user would turn a D-A-CH update into a data
 * migration and make a wrong number unfixable by a code change — and it would
 * create a second truth that drifts from this one.
 *
 * Only overrides are persisted (`nutrition_target_override`).
 *
 * On what is missing: there is no selenium target. The BLS carries sixteen
 * elements and selenium is not one of them, so it cannot be tracked here at
 * all. Saying that out loud beats a quietly absent row.
 */

/** Values D-A-CH states per sex. `[male, female]`. */
const DACH: Partial<Record<NutrientKey, [number, number]>> = {
  vitA: [850, 700],
  vitE: [14, 12],
  vitK: [70, 60],
  vitC: [110, 95],
  vitB1: [1.2, 1.0],
  vitB2: [1.4, 1.1],
  niacin: [15, 12],
  // BLS stores B6 in µg, so D-A-CH's 1,6 / 1,4 mg is 1600 / 1400 here.
  vitB6: [1600, 1400],
  magnesium: [350, 300],
};

/** Values D-A-CH states for all adults. */
const DACH_BOTH: Partial<Record<NutrientKey, number>> = {
  vitD: 20,
  folate: 300,
  vitB12: 4,
  calcium: 1000,
  iodine: 200,
  potassium: 4000,
};

const NO_SEX = 'Ohne die Angabe „Referenzwerte nach" gibt es hier keinen Wert.';
const NO_BODY =
  'Dafür fehlen Körpergröße, Gewicht oder Geburtsjahr im Profil.';
const NO_ENERGY = 'Dieses Ziel hängt am Energiebedarf, der noch nicht feststeht.';

function unavailable(
  key: NutrientKey,
  reason: string,
  sourceKeys: SourceKey[]
): TargetValue {
  return {
    direction: 'min',
    min: null,
    max: null,
    bandMax: null,
    unit: NUTRIENT_META[key].unit,
    cadence: 'daily',
    sourceKeys,
    rationaleDe: reason,
    origin: 'derived',
    unavailableReason: reason,
  };
}

function value(
  key: NutrientKey,
  fields: Omit<TargetValue, 'unit' | 'origin' | 'unavailableReason' | 'cadence'> &
    Partial<Pick<TargetValue, 'cadence'>>
): TargetValue {
  return {
    ...fields,
    cadence: fields.cadence ?? 'daily',
    unit: NUTRIENT_META[key].unit,
    origin: 'derived',
    unavailableReason: null,
  };
}

/** The D-A-CH value for this person, or null when sex is not stated. */
function bySex(ctx: TargetContext, key: NutrientKey): number | null {
  const pair = DACH[key];
  if (!pair) return null;
  if (ctx.referenceSex === null) return null;
  return ctx.referenceSex === 'male' ? pair[0] : pair[1];
}

/** A plain D-A-CH minimum, sex-dependent or not. */
function dachMin(
  key: NutrientKey,
  opts: { sexDependent: boolean; rationale: (v: number) => string }
): TargetDefinition['resolve'] {
  return (ctx) => {
    const amount = opts.sexDependent ? bySex(ctx, key) : (DACH_BOTH[key] ?? null);
    if (amount === null) return unavailable(key, NO_SEX, ['dach']);
    return value(key, {
      direction: 'min',
      min: amount,
      max: null,
      bandMax: null,
      sourceKeys: ['dach'],
      rationaleDe: opts.rationale(amount),
    });
  };
}

function def(
  key: NutrientKey,
  fields: Omit<TargetDefinition, 'key'>
): TargetDefinition {
  return { key, ...fields };
}

export const NUTRIENT_TARGETS: Partial<Record<NutrientKey, TargetDefinition>> = {
  /*
   * Energy is shown and never scored.
   *
   * An energy target is a weight target, and a "340 kcal left today" counter
   * turns a symptom diary into a budget game. The number is useful as a
   * denominator for the E%-targets and as context; it is not something to hit.
   */
  energy: def('energy', {
    evidence: 'dach_reference',
    showVerdict: false,
    inScore: false,
    cautionDe:
      'Eine Schätzung mit rund 10 % Streuung. Sie ist die Bezugsgröße für die Prozentziele, kein Tagessoll.',
    resolve: (ctx) => {
      if (ctx.energyKcal === null) return unavailable('energy', NO_BODY, ['mifflin']);
      return value('energy', {
        direction: 'range',
        min: Math.round(ctx.energyKcal * 0.9),
        max: null,
        bandMax: Math.round(ctx.energyKcal * 1.1),
        sourceKeys: ['mifflin'],
        rationaleDe: `Mifflin-St Jeor mal Aktivitätsfaktor ergibt rund ${Math.round(ctx.energyKcal)} kcal; angezeigt ist ein Korridor von ±10 %.`,
      });
    },
  }),

  /*
   * Protein is the one target whose DIRECTION a profile answer can flip.
   *
   * Normally a minimum: sarcopenia affects a quarter to nearly half of people
   * with RA, and the requirement sits above the general reference value. With a
   * clinician-set renal cap it gains a real, scored maximum — and that cap wins
   * over the sarcopenia raise, never the other way round.
   */
  protein: def('protein', {
    evidence: 'ra_specific',
    showVerdict: true,
    inScore: true,
    cautionDe: null,
    resolve: (ctx) => {
      if (ctx.weightKg === null) {
        return unavailable(
          'protein',
          'Ohne Körpergewicht lässt sich das Eiweißziel nicht berechnen.',
          ['ra_protein']
        );
      }
      const perKgMin = ctx.hasSarcopenia ? 1.5 : 1.0;
      const perKgBand = ctx.hasSarcopenia ? 1.5 : 1.2;
      const cap = ctx.renalImpairment ? ctx.proteinMaxGPerKg : null;

      // The cap wins. A raised requirement is a recommendation; a renal limit
      // is a restriction someone prescribed, and exceeding it is the harm.
      const min = cap === null ? perKgMin : Math.min(perKgMin, cap);
      const max = cap === null ? null : cap * ctx.weightKg;
      const bandMax = cap === null ? perKgBand * ctx.weightKg : null;

      const capNote =
        cap === null
          ? ''
          : ` Begrenzt auf ${cap} g je kg wegen der eingetragenen Nierenerkrankung — diese Obergrenze geht jeder Anhebung vor.`;
      const sarcNote = ctx.hasSarcopenia
        ? ' Angehoben von 1,0–1,2 auf 1,5 g je kg wegen der Angabe Sarkopenie.'
        : '';

      return value('protein', {
        direction: cap === null ? 'range' : 'range',
        min: min * ctx.weightKg,
        max,
        bandMax,
        sourceKeys: ['ra_protein', 'dach'],
        rationaleDe:
          `${min} g je kg × ${ctx.weightKg} kg = ${Math.round(min * ctx.weightKg)} g.` +
          sarcNote +
          capNote,
      });
    },
  }),

  /* Total fat is a distribution, not a goal — shown as a corridor, not scored. */
  fat: def('fat', {
    evidence: 'dge_general',
    showVerdict: false,
    inScore: false,
    cautionDe:
      'Die Fettmenge sagt weniger als die Fettqualität. Entscheidend sind die Zeilen darunter.',
    resolve: (ctx) => {
      if (ctx.energyKcal === null) return unavailable('fat', NO_ENERGY, ['dach']);
      return value('fat', {
        direction: 'range',
        min: gramsForEnergyShare(ctx.energyKcal, 0.3, 'fat'),
        max: null,
        bandMax: gramsForEnergyShare(ctx.energyKcal, 0.35, 'fat'),
        sourceKeys: ['dach'],
        rationaleDe: `30–35 % der ${Math.round(ctx.energyKcal)} kcal, umgerechnet mit 9 kcal je Gramm.`,
      });
    },
  }),

  satFat: def('satFat', {
    evidence: 'dge_general',
    showVerdict: true,
    inScore: true,
    cautionDe: null,
    resolve: (ctx) => {
      if (ctx.energyKcal === null) return unavailable('satFat', NO_ENERGY, ['dach']);
      const grams = gramsForEnergyShare(ctx.energyKcal, 0.1, 'fat');
      return value('satFat', {
        direction: 'max',
        min: null,
        max: grams,
        bandMax: null,
        sourceKeys: ['dach'],
        rationaleDe: `Höchstens 10 % der ${Math.round(ctx.energyKcal)} kcal, das sind ${Math.round(grams)} g. Gerechnet wird gegen den Energiebedarf, nicht gegen die tatsächlich gegessenen Kalorien — sonst hebt ein üppiger Tag seine eigene Grenze an.`,
      });
    },
  }),

  sugar: def('sugar', {
    evidence: 'dge_general',
    showVerdict: true,
    inScore: true,
    cautionDe:
      'Gemessen wird Gesamtzucker, auch der aus Obst und Milch. Die Empfehlung meint freien Zucker — der Wert liegt hier also systematisch höher als das, was gemeint ist.',
    resolve: (ctx) => {
      if (ctx.energyKcal === null) return unavailable('sugar', NO_ENERGY, ['who_sugar']);
      const grams = gramsForEnergyShare(ctx.energyKcal, 0.1, 'carbs');
      return value('sugar', {
        direction: 'max',
        min: null,
        max: grams,
        bandMax: null,
        sourceKeys: ['who_sugar'],
        rationaleDe: `Höchstens 10 % der ${Math.round(ctx.energyKcal)} kcal, das sind ${Math.round(grams)} g.`,
      });
    },
  }),

  fiber: def('fiber', {
    evidence: 'ra_specific',
    showVerdict: true,
    inScore: true,
    cautionDe: null,
    resolve: () =>
      value('fiber', {
        direction: 'min',
        min: 30,
        max: null,
        bandMax: null,
        sourceKeys: ['dge_fiber'],
        rationaleDe:
          'Richtwert 30 g für Erwachsene. Bei RA kommt der Mikrobiom-Gedanke dazu: Ballaststoffe sind das Substrat für kurzkettige Fettsäuren.',
      }),
  }),

  salt: def('salt', {
    evidence: 'ra_specific',
    showVerdict: true,
    inScore: true,
    cautionDe:
      'Der Bezug zur Gelenkentzündung stammt aus Labor- und Tierversuchen. Am Menschen mit RA ist er kaum untersucht.',
    resolve: () =>
      value('salt', {
        direction: 'max',
        min: null,
        max: 6,
        bandMax: null,
        sourceKeys: ['who_salt'],
        rationaleDe:
          'Die WHO nennt 5 g; 6 g ist der in Deutschland übliche Richtwert und der hier verwendete. Kochsalz verschiebt im Labor die Th17-Differenzierung.',
      }),
  }),

  /*
   * The most RA-specific number in the whole catalogue, and the steepest edge.
   *
   * 50 mg is a clinical recommendation, not a rule of thumb, so `overSlack`
   * drops attainment to zero at 60 mg rather than at the default 75 mg.
   */
  arachidonic: def('arachidonic', {
    evidence: 'ra_specific',
    showVerdict: true,
    inScore: true,
    cautionDe:
      'Arachidonsäure steckt fast nur in tierischen Lebensmitteln. Ein Tag ohne Fleisch, Wurst und Eigelb liegt fast immer darunter.',
    resolve: () =>
      value('arachidonic', {
        direction: 'max',
        min: null,
        max: 50,
        bandMax: null,
        overSlack: 1.2,
        sourceKeys: ['dge_rheuma_aa'],
        rationaleDe:
          'Höchstens 50 mg am Tag. Arachidonsäure ist die Vorstufe von Prostaglandin E2 und Leukotrien B4.',
      }),
  }),

  epaDha: def('epaDha', {
    evidence: 'ra_specific',
    showVerdict: true,
    inScore: true,
    cautionDe:
      'Über zwei Fischmahlzeiten pro Woche hinaus ist das aus Lebensmitteln allein schwer zu erreichen. Ein Präparat zählt hier mit, wird aber getrennt ausgewiesen.',
    resolve: () =>
      value('epaDha', {
        direction: 'min',
        min: 1,
        max: null,
        bandMax: null,
        cadence: 'weekly',
        sourceKeys: ['eular_lifestyle', 'efsa_epa_dha'],
        rationaleDe:
          '1 g am Tag im Wochenschnitt — bewusst über die Woche gerechnet, weil zwei Fischmahlzeiten pro Woche genau richtig sind und an fünf Tagen sonst „verfehlt" stünde. Der EFSA-Referenzwert für Gesunde liegt bei 0,25 g.',
      }),
  }),

  ala: def('ala', {
    evidence: 'dach_reference',
    showVerdict: true,
    inScore: true,
    cautionDe: null,
    resolve: (ctx) => {
      if (ctx.energyKcal === null) return unavailable('ala', NO_ENERGY, ['dach']);
      const grams = gramsForEnergyShare(ctx.energyKcal, 0.005, 'fat');
      return value('ala', {
        direction: 'min',
        min: grams,
        max: null,
        bandMax: null,
        sourceKeys: ['dach'],
        rationaleDe: `0,5 % der Energie als Alpha-Linolensäure, das sind ${grams.toFixed(1)} g. Der pflanzliche Omega-3-Hebel — bei veganer Ernährung der einzige.`,
      });
    },
  }),

  /*
   * Shown, never scored: there is no guideline number behind it, only the
   * mechanism that linoleic acid and ALA compete for the same desaturases.
   * Scoring an orientation would dress it up as something it is not.
   */
  n6n3Ratio: def('n6n3Ratio', {
    evidence: 'ra_specific',
    showVerdict: false,
    inScore: false,
    cautionDe:
      'Eine Orientierung ohne Leitlinienwert. Sie wird gezeigt, aber nicht bewertet.',
    resolve: () =>
      value('n6n3Ratio', {
        direction: 'max',
        min: null,
        max: 5,
        bandMax: null,
        sourceKeys: ['eular_lifestyle'],
        rationaleDe:
          'Als grobe Orientierung gilt ein Verhältnis unter 5:1. Linolsäure und Alpha-Linolensäure konkurrieren um dieselben Enzyme.',
      }),
  }),

  vitA: def('vitA', {
    evidence: 'dach_reference',
    showVerdict: true,
    inScore: true,
    cautionDe: null,
    resolve: dachMin('vitA', {
      sexDependent: true,
      rationale: (v) => `D-A-CH-Referenzwert ${v} µg Retinol-Äquivalent.`,
    }),
  }),

  vitD: def('vitD', {
    evidence: 'ra_specific',
    showVerdict: true,
    inScore: true,
    cautionDe:
      'Über Lebensmittel ist dieser Wert praktisch nicht zu erreichen; gedacht ist er für Eigensynthese und Präparate.',
    resolve: (ctx) => {
      const base = DACH_BOTH.vitD ?? 20;
      const amount = ctx.steroidLongTerm ? 25 : base;
      return value('vitD', {
        direction: 'min',
        min: amount,
        max: null,
        bandMax: null,
        sourceKeys: ctx.steroidLongTerm ? ['acr_giop', 'dach'] : ['dach'],
        rationaleDe: ctx.steroidLongTerm
          ? `Angehoben auf ${amount} µg (1000 IE), weil dauerhaft Kortison eingetragen ist. Die ACR-Leitlinie nennt 800–1000 IE zusammen mit Calcium.`
          : `Schätzwert ${amount} µg (800 IE) bei fehlender Bildung in der Haut.`,
      });
    },
  }),

  vitE: def('vitE', {
    evidence: 'ra_specific',
    showVerdict: true,
    inScore: true,
    cautionDe:
      'In RA-Studien werden 100–200 IE untersucht, das liegt über dem Referenzwert. Von mehr als 400 IE wird ausdrücklich abgeraten.',
    resolve: dachMin('vitE', {
      sexDependent: true,
      rationale: (v) => `D-A-CH-Schätzwert ${v} mg Tocopherol-Äquivalent.`,
    }),
  }),

  vitK: def('vitK', {
    evidence: 'dach_reference',
    showVerdict: true,
    inScore: true,
    cautionDe: null,
    resolve: dachMin('vitK', {
      sexDependent: true,
      rationale: (v) => `D-A-CH-Schätzwert ${v} µg.`,
    }),
  }),

  vitC: def('vitC', {
    evidence: 'dach_reference',
    showVerdict: true,
    inScore: true,
    cautionDe: null,
    resolve: dachMin('vitC', {
      sexDependent: true,
      rationale: (v) => `D-A-CH-Referenzwert ${v} mg.`,
    }),
  }),

  vitB1: def('vitB1', {
    evidence: 'dach_reference',
    showVerdict: true,
    inScore: true,
    cautionDe: null,
    resolve: dachMin('vitB1', {
      sexDependent: true,
      rationale: (v) => `D-A-CH-Referenzwert ${v} mg.`,
    }),
  }),

  vitB2: def('vitB2', {
    evidence: 'dach_reference',
    showVerdict: true,
    inScore: true,
    cautionDe: null,
    resolve: dachMin('vitB2', {
      sexDependent: true,
      rationale: (v) => `D-A-CH-Referenzwert ${v} mg.`,
    }),
  }),

  niacin: def('niacin', {
    evidence: 'dach_reference',
    showVerdict: true,
    inScore: true,
    cautionDe: null,
    resolve: dachMin('niacin', {
      sexDependent: true,
      rationale: (v) =>
        `D-A-CH-Referenzwert ${v} mg Niacin-Äquivalent — Äquivalent, weil der Körper Niacin auch aus Tryptophan bildet.`,
    }),
  }),

  vitB6: def('vitB6', {
    evidence: 'dach_reference',
    showVerdict: true,
    inScore: true,
    cautionDe: null,
    resolve: dachMin('vitB6', {
      sexDependent: true,
      rationale: (v) =>
        `D-A-CH-Referenzwert ${v / 1000} mg, hier in µg angegeben (${v} µg), weil der Katalog Vitamin B6 in µg führt.`,
    }),
  }),

  /*
   * Shown, never scored.
   *
   * Under methotrexate, folate is a prescribed weekly regimen with timing rules
   * — 5 mg on a different day from the MTX. A "more is better" progress bar
   * could contradict the rheumatologist who set that schedule.
   */
  folate: def('folate', {
    evidence: 'dach_reference',
    showVerdict: false,
    inScore: false,
    cautionDe:
      'Folsäure unter Methotrexat ist ein verordnetes Schema mit festem Abstand zur MTX-Gabe — kein Ernährungsziel. Hier steht nur, was über das Essen dazukam.',
    resolve: dachMin('folate', {
      sexDependent: false,
      rationale: (v) => `D-A-CH-Referenzwert ${v} µg Folat-Äquivalent.`,
    }),
  }),

  vitB12: def('vitB12', {
    evidence: 'dach_reference',
    showVerdict: true,
    inScore: true,
    cautionDe: null,
    resolve: (ctx) => {
      const amount = DACH_BOTH.vitB12 ?? 4;
      const vegan = ctx.dietForm === 'vegan';
      return value('vitB12', {
        direction: 'min',
        min: amount,
        max: null,
        bandMax: null,
        sourceKeys: ['dach'],
        rationaleDe: vegan
          ? `D-A-CH-Schätzwert ${amount} µg. Über pflanzliche Lebensmittel ist das nicht zu decken — bei veganer Ernährung ist ein Präparat der vorgesehene Weg.`
          : `D-A-CH-Schätzwert ${amount} µg.`,
      });
    },
  }),

  calcium: def('calcium', {
    evidence: 'ra_specific',
    showVerdict: true,
    inScore: true,
    cautionDe: null,
    resolve: (ctx) => {
      const amount = ctx.steroidLongTerm ? 1200 : (DACH_BOTH.calcium ?? 1000);
      return value('calcium', {
        direction: 'min',
        min: amount,
        max: null,
        bandMax: null,
        sourceKeys: ctx.steroidLongTerm ? ['acr_giop', 'dach'] : ['dach'],
        rationaleDe: ctx.steroidLongTerm
          ? `Angehoben von 1000 auf ${amount} mg, weil dauerhaft Kortison eingetragen ist.`
          : `D-A-CH-Referenzwert ${amount} mg.`,
      });
    },
  }),

  magnesium: def('magnesium', {
    evidence: 'dach_reference',
    showVerdict: true,
    inScore: true,
    cautionDe: null,
    resolve: dachMin('magnesium', {
      sexDependent: true,
      rationale: (v) => `D-A-CH-Referenzwert ${v} mg.`,
    }),
  }),

  /*
   * Shown, never judged.
   *
   * Thirty to sixty percent of the anaemia in RA is anaemia of inflammation:
   * hepcidin blocks absorption and iron simply does not help. A bar reading
   * "missed" would push towards a supplement that cannot work, so the number is
   * information and nothing else.
   */
  iron: def('iron', {
    evidence: 'ra_specific',
    showVerdict: false,
    inScore: false,
    cautionDe:
      'Blutarmut bei RA ist häufig eine Entzündungsanämie. Dabei hilft mehr Eisen nicht — der Wert steht hier zur Information, nicht als Ziel.',
    resolve: (ctx) => {
      if (ctx.referenceSex === null) return unavailable('iron', NO_SEX, ['dach']);
      const premenopausal =
        ctx.referenceSex === 'female' && ctx.menopauseStage !== 'post';
      const amount = premenopausal ? 15 : 10;
      return value('iron', {
        direction: 'min',
        min: amount,
        max: null,
        bandMax: null,
        sourceKeys: ['dach'],
        rationaleDe: premenopausal
          ? `D-A-CH-Referenzwert ${amount} mg vor der Menopause.`
          : `D-A-CH-Referenzwert ${amount} mg.`,
      });
    },
  }),

  /*
   * The one target where diet form changes the number rather than the wording:
   * D-A-CH gives zinc as a phytate-dependent range, and a plant-heavy diet
   * carries more phytate, which binds zinc.
   */
  zinc: def('zinc', {
    evidence: 'dach_reference',
    showVerdict: true,
    inScore: true,
    cautionDe: null,
    resolve: (ctx) => {
      if (ctx.referenceSex === null) return unavailable('zinc', NO_SEX, ['dach']);
      const highPhytate =
        ctx.dietForm === 'vegan' || ctx.dietForm === 'vegetarian';
      const amount =
        ctx.referenceSex === 'male'
          ? highPhytate
            ? 16
            : 11
          : highPhytate
            ? 10
            : 7;
      return value('zinc', {
        direction: 'min',
        min: amount,
        max: null,
        bandMax: null,
        sourceKeys: ['dach'],
        rationaleDe: highPhytate
          ? `D-A-CH gibt Zink als Spanne je nach Phytatgehalt an; bei pflanzenbetonter Kost gilt das obere Ende, ${amount} mg.`
          : `D-A-CH gibt Zink als Spanne je nach Phytatgehalt an; hier das untere Ende, ${amount} mg.`,
      });
    },
  }),

  iodine: def('iodine', {
    evidence: 'dach_reference',
    showVerdict: true,
    inScore: true,
    cautionDe: null,
    resolve: dachMin('iodine', {
      sexDependent: false,
      rationale: (v) => `D-A-CH-Schätzwert ${v} µg.`,
    }),
  }),

  potassium: def('potassium', {
    evidence: 'dach_reference',
    showVerdict: true,
    inScore: true,
    cautionDe: null,
    resolve: dachMin('potassium', {
      sexDependent: false,
      rationale: (v) => `D-A-CH-Schätzwert ${v} mg — das Gegenstück zum Natrium.`,
    }),
  }),
};

export const TARGET_KEYS = Object.keys(NUTRIENT_TARGETS) as NutrientKey[];

export { ageFromBirthYear, energyTargetKcal };
