<p align="center">
  <img src="assets/logo-master.png" alt="Wellbeing" width="128">
</p>

# Wellbeing

Ernährungs-, Symptom- und Medikations-Tracker für eine Person mit rheumatoider
Arthritis und noch unbekannten Lebensmittel-Unverträglichkeiten. Selbst
gehostet, intern erreichbar unter `https://wellbeing.int.buse.io`.

Das Ziel ist nicht „Kalorien zählen“, sondern herauszufinden, **welches
Verhalten sich wie auswirkt**. Deshalb bestehen Mahlzeiten aus wiederverwendbaren
Lebensmitteln mit Kennzeichnung (Gluten, Laktose, Histamin, …) statt aus
Freitext, und deshalb werden Schlaf, Stress, Bewegung, Zyklus und Kortisondosis
mitgetrackt: ohne diese Störfaktoren wird bei RA jeder Schub fälschlich dem
Essen zugeschrieben.

## Stack

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Tailwind v4 ·
Drizzle ORM auf Postgres 17 · Auth.js v5 mit Zitadel-OIDC · mobile-first PWA.

## Lokal entwickeln

```bash
npm ci
npm run db:up                    # Postgres 17 in Docker
npm run db:migrate               # Schema anlegen
npm run db:seed                  # Symptome, Tags, Gelenke (idempotent, s. db:check)
cp .env.example .env.local       # AUTH_* ausfüllen, siehe unten
npm run dev
```

`AUTH_ZITADEL_ID` und `AUTH_ZITADEL_SECRET` kommen aus dem Cluster-Repo:

```bash
cd ../terraform/home-talos-cluster/terraform/zitadel
tofu output -raw wellbeing_client_id
tofu output -raw wellbeing_client_secret
```

Lokal braucht es **kein** `NODE_EXTRA_CA_CERTS`: über den LAN-Loadbalancer
liefert Zitadel ein öffentlich vertrautes Zertifikat. Nur im Cluster löst
`zitadel.int.buse.io` auf das Cluster-Traefik mit interner CA auf.

Ohne VPN-Verbindung ins Heimnetz ist kein Login möglich. Um die Oberfläche
trotzdem zu entwickeln, erzeugt

```bash
npm run db:seed && npx tsx src/db/scripts/dev-session.ts
```

ein gültiges Session-Cookie. Es wird mit dem echten `AUTH_SECRET` signiert und
ist damit dasselbe Artefakt, das ein erfolgreicher Login produziert — es
funktioniert nur gegen einen Server mit demselben Secret. Niemals gegen die
produktive Instanz benutzen.

### Kamera und Barcode

`getUserMedia` verlangt einen Secure Context. `http://localhost:3000`
funktioniert, `http://192.168.x.x:3000` vom Handy aus **nicht** — dafür
`next dev --experimental-https` verwenden.

Auf dem iPhone gibt es keinen funktionierenden `BarcodeDetector` (in iOS 17
hinter einem Flag, seit iOS 18 defekt). Dort läuft immer der WASM-Pfad
(`zxing-wasm`), der dynamisch nachgeladen wird.

## Prüfen

```bash
npm run pre-deploy   # type-check + lint + test + build
npm run db:check     # Integrationstest gegen eine echte Datenbank
npm run test:e2e     # Playwright
```

Playwright läuft gegen „Mobile Chrome" und „Mobile Safari" (iPhone-Profil).
Für WebKit fehlt auf diesem Rechner noch eine Systemabhängigkeit:

```bash
sudo apt-get install libavif16 && npx playwright install webkit
```

`npm run db:check` ist der wichtigere der beiden Tests: CHECK-Constraints, der
partielle Unique-Index für das idempotente Abhaken von Medikamenten und die
Tagesgrenze lassen sich nur gegen Postgres verifizieren, nicht im Unit-Test.

## Entscheidungen, die man kennen muss

**Der logische Tag** (`src/lib/time.ts`) läuft von 04:00 bis 04:00
Europe/Berlin. Ein Abendessen um 23:30 zählt zum richtigen Tag, ein Symptom um
01:00 noch zum Tag davor. `log_date` kann keine Generated Column sein:
`timezone(text, timestamptz)` ist `STABLE`, nicht `IMMUTABLE`. Clients senden
nie ein `log_date` — die Server Action leitet es ab, damit eine falsch gestellte
Handy-Uhr die Daten nicht verfälscht.

**Nährwerte werden eingefroren, Kennzeichnungen nicht.** Eine Korrektur an
einem Lebensmittel darf nicht rückwirkend die Verlaufscharts umschreiben, also
liegt der Nährwert-Snapshot auf `meal_item`. Umtaggen ist dagegen ein
Wissensgewinn („enthält versteckte Laktose“) und gilt bewusst rückwirkend — das
ist der ganze Zweck der Übung.

**Open Food Facts weiß nichts über Histamin, FODMAP, Nachtschatten oder
Salicylate.** Diese Kennzeichnungen entstehen ausschließlich aus den lokalen
Regeln in `src/db/seed/tagRules.ts`. Deshalb wird der OFF-Payload in
`off_product.raw` behalten: Regeln ändern sich, und sie müssen ohne erneutes
Abrufen neu ausgewertet werden können. Negative Regeln („glutenfrei“) sind
nicht optional — ohne sie bekommt jedes glutenfreie Brot ein Gluten-Tag.

**Der Nährstoffkatalog ist der Bundeslebensmittelschlüssel 4.0** — seit dem
16.12.2025 unter CC BY 4.0 frei, 7140 deutsche Lebensmittel. Er deckt das ab,
was Open Food Facts nicht kann: Unverpacktes ohne Barcode. Wichtiger noch sind
seine Messwerte. Laktose, Fructose, Glucose, Sorbit, Mannit und Alkohol stehen
als Gramm pro 100 g darin, und das schlägt jede Namensregel: Schnittkäse misst
0 g Laktose, laktosefreie Milch 0,05 g und Vollmilch 3,89 g, und „Weinkraut mit
Apfel gedünstet“ enthält 0,58 g Alkohol, den kein Stichwort je fände. Deshalb
gibt es die Regeltypen `bls_measured` und `bls_group`. Die Schwelle liegt bei
0,5 g und nicht bei 0 — sonst bekäme jede laktosefreie Milch ein Laktose-Tag.

Ein nicht gemessener Nährwert ist `null` und entscheidet **nichts**; ein
gemessener Nullwert ist `0` und verhindert das Tag. Diese Unterscheidung ist
der ganze Vertrag zwischen Katalog und Regeln.

Aus derselben Quelle kommen die Mikronährstoffe für die Zielsetzung: Vitamine,
Mineralstoffe, das Fettsäurespektrum und die löslichen Ballaststoffe, insgesamt
25 weitere Spalten auf `food_catalog`. Gemessen sind sie für 95–100 % des
Katalogs; die Ausreißer sind Jod (88 %) und die löslichen Ballaststoffe (47 %),
und genau dort ist „zu wenig Messwerte" die normale Antwort statt der Ausnahme.
`db:check` hält die Anteile als Untergrenzen fest — eine Neu-Einspielung, die
still eine Spalte verliert, schriebe sonst weiterhin 7140 Zeilen und fiele
nirgends auf. Sie bleiben in ihren BLS-eigenen
Einheiten — `select vit_d_100 from food_catalog` soll eine Zahl liefern, die
sich gegen eine Packungsangabe prüfen lässt. **Selen ist nicht dabei**: der BLS
führt genau sechzehn Elemente und Selen gehört nicht dazu, also gibt es dafür
auch kein Ziel.

Die Spalten werden nicht mehr über feste Indizes gelesen, sondern über die
Nährstoffcodes in der Kopfzeile (`resolveColumns`). Der Importer bricht ab, wenn
ein Code fehlt, mehrdeutig ist oder an einer anderen Stelle steht als erwartet,
und prüft anschließend die Spaltenmediane gegen Plausibilitätsbänder — ein
Versatz um drei Spalten schiebt die `Datenherkunft` in den Wert-Slot, und das
sieht ein Header-Vergleich nicht.

Die Daten liegen als TS-Modul (`src/db/seed/data/bls-4.0.ts`) und nicht als
CSV-Datei vor, weil `src/db/migrate.ts` per esbuild in den Init-Container
gebündelt wird — eine zur Laufzeit über einen Pfad gelesene Datei gäbe es dort
nicht. Regeneriert wird sie mit `src/db/scripts/import-bls.ts`; die zwei
Entpack-Kommandos stehen im Kopf dieser Datei.

Quelle: Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version
4.0 — Deutsche Nährstoffdatenbank. Karlsruhe.
DOI [10.25826/Data20251217-134202-0](https://doi.org/10.25826/Data20251217-134202-0).
Lizenz CC BY 4.0. Die Namensnennung ist Lizenzbedingung und steht auch in der
App unter „Einstellungen“.

**Es gibt genau eine Darstellung des Begleiters.** Vorher waren es zwei: ein
512er-PNG als Standbild und darüber das transparente Canvas. Ausgeblendet wurde
das PNG nie — das Canvas hob nur seine *eigene* Opazität an, und Rives
Standard-`Fit.contain` setzte die lebende Figur auf einen anderen Maßstab als
den engen Quadratschnitt des PNGs. Ergebnis: das Maskottchen zweimal in der
Ecke, eines bewegt, eines nicht. Die Standbild-Schicht ist deshalb ganz weg, und
ein Test in `services/nutrition/__tests__/mascot.test.ts` hält sie draußen.

Die Figur ist damit die `.riv` oder nichts. Ohne JavaScript, vor dem Laden der
Datei und bei `prefers-reduced-motion: reduce` erscheint der Begleiter einfach
nicht — jeder Schirm sagt ohnehin in Text, was er zu sagen hat. Der Auftritt
hängt am `onReadyChange` des Canvas, damit in der Ecke nie ein leerer, aber
antippbarer 144-px-Kasten steht.

**Ob das Asset da ist, wird nachgesehen, nicht konfiguriert.**
`src/components/mascot/artwork.ts` prüft einmal beim Modul-Laden, ob die `.riv`
unter `public/mascot/` liegt. Ein handgesetztes Flag könnte in beide Richtungen
lügen, und beides sieht man im Diff nicht. Fehlt die Datei, rendert `MascotDock`
gar nichts — noch vor dem 90-Tage-Read, der sonst für nichts liefe. Der Preis
ist, dass eine neue Datei einen Neustart braucht, keinen Rebuild.

**Ein Asset, das Ausdrücke verspricht, muss sie nicht nach außen geben.** Die
erste Wahl für dieses Feature war ein Wolken-Maskottchen, dessen Seite „State
Machine & 6 Expressions" auszeichnete. Geladen im Browser liefert
`stateMachineInputs('State Machine 1')` **undefined**, und alle sieben
ViewModels haben null Eigenschaften — aus dem Code heraus ist die Datei ein
Deko-Loop. Der einzige Weg, das zu erkennen, ist Laden und Fragen.

Das gewählte Asset steuert über **Data Binding**, nicht über
State-Machine-Inputs: ein gebundenes ViewModel mit dem Enum `FaceEmotion`
(Neutral, Happy, Sad, Intense Sad, Angry, Intense Angry, Scared, Eating) und
Triggern wie `anim_wave`. Deshalb braucht das Canvas `autoBind: true` — ohne das
gibt es nichts zu setzen. Drei der acht Gesichter sind in Gebrauch; `Angry` und
die beiden „Intense"-Stufen bleiben absichtlich unbenutzt, weil die App nicht
wütend auf die Person wird und ein Tag über einer Salzgrenze kein Drama ist.

Ein Eigenschaftsname, den es nicht gibt, liefert in der Rive-API `null` statt zu
werfen. `applyMood` probiert deshalb und schluckt: die Verschlechterung ist
„die Idle-Animation läuft weiter", kein Fehler im Render.

**Die Figur ist wählbar, die Farbe nicht.** Das Enum `Characters` hat genau zwei
Werte, und ihre Farben liegen als Keyframes in der Datei: `col_merv` ist Amber
(#84501A, #704316), `col_orson` Violett (#492C70, #583784), und `col_select`
hängt sie an `CharacterSelect`. Es gibt keine Farb-, Skin- oder
Theme-Eigenschaft — eine dritte Farbe hieße, die `.riv` zu bearbeiten. Deshalb
heißt die Einstellung Figur und nicht Farbe: `user_setting.mascot_character`
(`'merv' | 'orson'`), Standard `merv`, weil Ambers Ton fast genau auf
`--color-primary` liegt und die Figur damit als Teil dieser App liest. Die
Chip-Reihe in den Einstellungen nennt die beiden Namen, der Hinweis darunter die
Farben — zwei nackte Namen wären für niemanden eine Wahl, der beide Figuren noch
nicht gesehen hat.

Orson ist Index 0 des Enums und damit das, was die Datei zeigt, wenn niemand
`CharacterSelect` setzt. Ein fehlgeschlagenes `initCharacter` fällt also jetzt
auf die **falsche** Figur zurück, nicht mehr auf die richtige — „Violett
erschien, obwohl Amber gewählt ist" ist diese Zeile und keine verlorene Spalte.
Ein Wechsel in den Einstellungen montiert die Leinwand neu (`key={character}` in
`mascot-dock-frame.tsx`): die alte Figur geht hinter die Leiste, die neue tritt
hervor.

**Der Auftritt gehört der Sitzung, die Pause der Geometrie.** Der Walk-Cycle
läuft einmal pro Sitzung, nicht einmal pro Mount — `hasWalkedIn` in
`dock-visibility.ts` macht daraus eine Aussage über die App statt über Nexts
Reconciliation, und die drei Stellen, die ihn zurückholen (Kopfzeilen-Knopf,
Einstellungs-Schalter, Figurenwechsel), setzen ihn zurück. Und die Pause der
Zeichnung wartet: während eines Seitenwechsels liegt die Leinwand bis zu ≈1,1 s
in `::view-transition-*(site-mascot)`-Pseudo-Elementen, wo der
IntersectionObserver sie für verschwunden hält. Sofort zu pausieren war genau
das, was als „er verschwindet beim Seitenwechsel und kommt in der Atem-Schleife
zurück" zu sehen war; ein verborgener Tab pausiert weiterhin sofort.

**Die Runtime bleibt hinter `await import(`.** `@rive-app/canvas-single` bündelt
seine WASM ins JavaScript — 2,5 MB in einem eigenen Chunk, der in keinem
Initial-Bundle hängt (`build-manifest.json` führt ihn auf keiner Seite). Ein
einziger Top-Level-Import würde ihn in den gemeinsamen Chunk jeder Route ziehen,
und nichts an der laufenden App sähe falsch aus. Ein Test in
`services/nutrition/__tests__/mascot.test.ts` scannt `src/**` daraufhin.

Titel, Urheber, Quelle und Lizenz des Assets gehören in `ASSET_ATTRIBUTION`. Die
Settings-Karte „Illustration" rendert daraus und erscheint nur, wenn das Asset
wirklich ausgeliefert wird — eine Namensnennung für eine Datei, die nicht im
Repo liegt, wäre ein Zitat von nichts. Bei CC BY ist die Nennung
Lizenzbedingung.

**Dosisänderungen sind Historie, kein Edit.** Das alte Schema wird mit
`valid_to` geschlossen und ein neues angelegt. Die vorherige Dosis ist eine
Aussage über einen Zeitraum und in der Auswertung ein Störfaktor.

**Migrationen laufen im Init-Container**, nie im App-Prozess. `npm run db:generate`
erzeugt die SQL-Datei, die committet wird. **Niemals `drizzle-kit push`** — das
verändert die Datenbank ohne committete Migration und lässt lokale und
produktive Umgebung dauerhaft auseinanderlaufen.

**Jede Server Action beginnt mit `requireUserForAction()`.** Server Actions sind
adressierbare POST-Endpunkte; das Layout, das das Formular gerendert hat,
schützt sie nicht.

## Deployment

Das Image wird von GitHub Actions nach `ghcr.io/maikbuse/wellbeing:<sha>-amd64`
gebaut. Chart, ArgoCD-Application und Zitadel-Terraform liegen im Repo
`home-talos-cluster`:

- `helm/wellbeing/` — Deployment, Service, HTTPRoute, CNPG-Cluster,
  NetworkPolicies, CA-ConfigMap, Backup-CronJob
- `apps/wellbeing.yaml` — ArgoCD-Application (sync-wave 2)
- `terraform/zitadel/` — OIDC-Client, Projekt `Household`, Rolle `wellbeing-user`
- `helm/wellbeing/SECRET.md` — das `kubeseal`-Kommando

`image.tag` wird nach dem ersten Build von argocd-image-updater verwaltet und
nie von Hand editiert.

## Backup und Restore

Ein nächtlicher `pg_dump` schreibt nach `nfs-priv`; dieser Share liegt in der
VM `home-nas-1`, die im wöchentlichen Proxmox-Backup enthalten ist. Das ist
der einzige Pfad, auf dem diese Daten in einem existierenden, geprüften Backup
landen — im Cluster selbst gibt es sonst **kein** Postgres-Backup.

Ein Backup, das nie zurückgespielt wurde, ist eine Vermutung. Die Probe:

```bash
kubectl -n wellbeing exec deploy/wellbeing -- ls -1t /backup | head -3   # falls gemountet
# oder direkt aus dem Job-Pod kopieren:
kubectl -n wellbeing cp <backup-pod>:/backup/wellbeing-YYYYMMDD-HHMM.dump ./restore.dump

npm run db:down && npm run db:up
pg_restore --clean --if-exists --no-owner \
  -d postgres://wellbeing:wellbeing@localhost:5432/wellbeing ./restore.dump
npm run db:check    # Zeilenzahlen und Constraints prüfen
```

## Was diese App nicht ist

Wellbeing sammelt eigene Beobachtungen und stellt statistische Zusammenhänge
dar. Zusammenhang ist nicht Ursache, und die App stellt keine Diagnose.
Änderungen an Ernährung oder Medikation gehören in die Hand der behandelnden
Ärztin.
