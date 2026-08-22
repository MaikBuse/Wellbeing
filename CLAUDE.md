# Wellbeing — Arbeitsanweisungen

Ernährungs-, Symptom- und Medikations-Tracker. Gesundheitsdaten einer einzelnen
Person, selbst gehostet, intern erreichbar. Deployment-Vertrag steht in
`/home/maik/development/terraform/home-talos-cluster/CLAUDE.md`.

## Stack

Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 (CSS-first,
keine `tailwind.config`) · shadcn-Konventionen in `src/components/ui` · Drizzle
ORM + postgres.js auf Postgres 17 · Auth.js v5 (Zitadel-OIDC) · zod · Vitest ·
Playwright · npm.

Routen englisch, UI-Texte deutsch. Keine i18n-Library.

## Regeln

- **`next-auth` exakt pinnen** (`5.0.0-beta.32`, kein Caret), `@auth/core` per
  `overrides`. Zwischen Betas gibt es Breaking Changes. Jedes Upgrade braucht
  einen vollen OIDC-Roundtrip als Test.
- **Jede Server Action beginnt mit `await requireUserForAction()`** und scopet
  jede Query auf `user.id`. Server Actions sind adressierbare POST-Endpunkte —
  das Layout schützt sie nicht. Keine Ausnahmen.
- **Authentifizierung gehört nicht in `proxy.ts`.** Die Grenze ist
  `src/app/(app)/layout.tsx`.
- **Niemals `drizzle-kit push`.** Nur `db:generate` und die erzeugte SQL-Datei
  committen. Push lässt lokale und produktive Datenbank dauerhaft
  auseinanderlaufen.
- **Tagesgrenzen nur über `src/lib/time.ts`.** Nie `occurred_at::date`, nie mit
  86 400 s rechnen (DST macht Tage 23 oder 25 Stunden lang). Clients senden nie
  ein `log_date`.
- **Nährwerte auf `meal_item` sind ein Snapshot** und werden nicht implizit neu
  berechnet. Kennzeichnungen (`food_tag`) sind es nicht und gelten rückwirkend.
  Diese Asymmetrie ist beabsichtigt.
- **Dosisänderungen schließen das alte Schema** (`valid_to`) und legen ein neues
  an. Nie eine bestehende Dosis überschreiben.
- **Deutsche Dezimalkommas**: `Number('12,5')` ist `NaN`. Zahlenfelder gehen
  durch `germanNumber` aus `src/lib/validation/common.ts`.
- **Eingabefelder nie unter 16 px** — sonst zoomt iOS beim Fokus und zoomt nicht
  zurück. Tap-Targets mindestens 44 px.
- **Farbe codiert nie allein einen Wert.** Die Severity-Rampe steht immer neben
  einer Zahl oder einem Label; Rosé und Apricot der Palette liegen zu nah
  beieinander.
- **Gesundheitsdaten-Hygiene**: keine Lebensmittelnamen, Gewichte, Symptome oder
  Diagnosen in `console.log`, Fehlermeldungen oder committeten
  Playwright-Traces.
- **Kein Auth-Bypass im Produktionspfad.** `src/db/scripts/dev-session.ts`
  braucht das echte `AUTH_SECRET` und ist damit kein Bypass — dabei bleibt es.

## Vor dem Abschluss

```bash
npm run pre-deploy   # type-check + lint + test + build
npm run db:check     # Integrationstest gegen echtes Postgres
```

`db:check` ist der wichtigere Test. Constraints, der partielle Unique-Index für
das idempotente Abhaken von Medikamenten und die Tagesgrenze lassen sich nur
gegen die Datenbank verifizieren.

Nach Schema-Änderungen: `npm run db:generate`, erzeugte SQL prüfen (auf
Identifier über 63 Zeichen achten — Postgres kürzt still und der Snapshot
driftet), dann `npm run db:migrate` und `npm run db:check`.

## Phasen

Phase 1 (fertig) ist das Tracking. Phase 2 sind Charts, Verdachts-Ranking und
Export, Phase 3 der Eliminations-Modus; die Tabellen dafür existieren bereits.

Für Phase 2 gilt: die Auswertung muss ehrlich sein. Zwei getrennte Modelle
(Reaktion pro Mahlzeit vs. RA-Score am Folgetag), Outcome als Abweichung vom
eigenen 7-Tage-Rolling-Median, Block-Bootstrap statt iid, harte Fallzahl-Gates,
Benjamini-Hochberg, und das Wort „signifikant“ kommt nicht vor. Vor dem Ausliefern
gegen synthetische Datensätze mit bekanntem injiziertem Effekt **und** gegen
Null-Datensätze testen: wenn die Pipeline in reinem Rauschen Signale findet,
soll das Vitest zeigen und nicht die Ernährung.
