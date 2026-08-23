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
- **Der Lebensmittel-Katalog ist geteilt, die Tagebuchdaten nicht.** `food`,
  `food_portion`, `food_tag` und `off_product` gelten für alle Konten; `food`
  trägt nur noch `created_by_user_id` als Herkunft. Auf dieser Spalte wird
  **nie** gefiltert — sie heißt genau deshalb nicht mehr `user_id`, damit ein
  vergessener Filter ein Typfehler ist. Alles mit `log_date` (`meal`,
  `symptom_entry`, `daily_log`, `medication*`) bleibt strikt auf `user.id`
  gescopet. Persönlich bleibt auch das Ranking: `frequentFoodsForSlot` zählt die
  eigenen Mahlzeiten.
- **Authentifizierung gehört nicht in `proxy.ts`.** Die Grenze ist
  `src/app/(app)/layout.tsx`.
- **Niemals `drizzle-kit push`.** Nur `db:generate` und die erzeugte SQL-Datei
  committen. Push lässt lokale und produktive Datenbank dauerhaft
  auseinanderlaufen.
- **Tagesgrenzen nur über `src/lib/time.ts`.** Nie `occurred_at::date`, nie mit
  86 400 s rechnen (DST macht Tage 23 oder 25 Stunden lang). Clients senden nie
  ein `log_date` und rechnen nie selbst einen Tag aus — `todayLogDate()` in einer
  `'use client'`-Komponente ignoriert die Nutzereinstellung und ist über die
  04:00-Grenze ein Hydration-Mismatch. Eine vom Nutzer gewählte Uhrzeit wird
  serverseitig mit `instantForLogDateTime(logDate, 'HH:MM', …)` zum Instant, und
  das gespeicherte `log_date` kommt weiterhin aus `toLogDate` dieses Instants.
- **Revalidierung nur über `src/lib/revalidate.ts`.** Kein `revalidatePath` in
  einer Action. Die Pfadmengen sind dort einmal beschrieben, weil sie verstreut
  auseinandergelaufen sind: neue Lebensmittel wurden auf `/foods` revalidiert,
  aber nicht auf `/`, wo die Picker-Chips stehen. `refresh()` gehört nicht dazu —
  es setzt das schwächere Signal und würde `revalidatePath` abschwächen.
- **Der BLS-Katalog ist eine unveränderte Referenz.** `food_catalog` wird
  ausschließlich aus `src/db/seed/data/bls-4.0.ts` geseedet und nie editiert;
  Auswahl kopiert nach `food` (`copyCatalogEntryToLibrary`). Ein **nicht
  gemessener** Nährwert ist `null` und entscheidet für eine `bls_measured`-Regel
  **nichts**; ein gemessener Nullwert ist `0` und verhindert das Tag. Schwellen
  liegen nicht bei 0: laktosefreie Milch misst 0,05 g Laktose. Regeneriert wird
  die Datei mit `src/db/scripts/import-bls.ts` — als TS-Modul, nicht als CSV,
  weil `migrate.ts` in den Init-Container gebündelt wird. Die CC-BY-Nennung des
  Max Rubner-Instituts in README und `/settings` ist Lizenzbedingung.
- **Nährwerte auf `meal_item` sind ein Snapshot** und werden nicht implizit neu
  berechnet. Kennzeichnungen (`food_tag`) sind es nicht und gelten rückwirkend.
  Diese Asymmetrie ist beabsichtigt.
- **Mikronährstoffe und Zielwerte stehen auf der rückwirkenden Seite dieser
  Asymmetrie.** Mikronährstoffe liegen nur in `food_catalog` und werden über
  `food.bls_catalog_id` zur Lesezeit gejoint, wie `mealMeasuredRange` es für die
  Trigger-Nährstoffe längst tut; eingefroren wird nur, was editierbar ist, und
  ein Mikronährstoff hat kein Formular. Zielwerte sind Wissen und leben als
  TS-Konstanten in `src/services/nutrition/targets/catalog.ts` — nur
  Übersteuerungen stehen in der Datenbank. Ein BLS-Release verschiebt damit
  historische Mikrowerte, und das ist gewollt.
- **Nicht gemessen ist nicht null, auch nicht auf Tagesebene.** Jeder
  Nährstoff-Tageswert trägt eine eigene, grammgewichtete Abdeckung
  (`src/services/nutrition/coverage.ts`), und die Bewertung ist
  richtungsabhängig: über einer Obergrenze gilt bei jeder Abdeckung, unter einer
  Obergrenze erst ab 0,85. Ein unvollständig erfasster Tag kann nur
  unterschätzen. Selen fehlt im BLS und wird deshalb gar nicht erst angeboten.
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
- **Commits gehen direkt auf `main`.** Ein-Personen-Projekt ohne Review: kein
  Feature-Branch, kein PR, wenn ein Commit gewünscht ist. Committen nur auf
  Aufforderung, pushen nur auf ausdrückliche Aufforderung.

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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
