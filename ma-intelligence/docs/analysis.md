# Bestandsaufnahme und Zielarchitektur

Stand: 2026-09-07. Diese Datei ist die Eingangsanalyse. Sie wird nicht laufend
fortgeschrieben — der aktuelle Stand steht in `agent/CURRENT_STATE.md`.

## 1. IST-Zustand des Repositorys

Das Repository `Lendrot/superpowers` ist ein Fork von `obra/superpowers`, einem
Plugin mit Arbeits-Skills fuer Coding-Agenten. Es enthaelt zwei voneinander
unabhaengige Dinge:

| Bereich | Inhalt | Bezug zur Plattform |
| --- | --- | --- |
| `skills/`, `hooks/`, `.claude-plugin/`, `tests/`, `docs/` (Wurzel) | Der Superpowers-Plugin-Fork (Upstream-Code) | Werkzeug, kein Baustein |
| `ai-battle-royale/` | Eigenstaendige TypeScript-Simulation (deterministische Engine, Zod, Vitest) | Vorbild fuer Struktur und Disziplin, inhaltlich unbeteiligt |

**Es gibt keinen bestehenden M&A-Code.** Gesucht wurde nach Karten-Bibliotheken
(Leaflet, MapLibre, Mapbox), nach M&A-, Deal- und Rohstoffbegriffen sowie nach
Geodaten — kein Treffer ausserhalb dieser Analyse. Der Arbeitsbranch
`claude/ma-intelligence-platform-7s9wv4` war beim Start deckungsgleich mit `main`.

Damit ist die Ausgangslage eindeutig: Die Plattform beginnt bei null. Sie ist
kein Umbau eines bestehenden Kartenprojekts.

## 2. Vorhandene Architektur

Der Superpowers-Teil ist eine Sammlung von Markdown-Skills plus Shell-Hooks ohne
Laufzeit, ohne Datenbank und ohne Frontend. Er hat kein Datenmodell.

`ai-battle-royale/` ist ein sauber geschnittenes Node-22-Projekt:

- TypeScript im `strict`-Modus mit `noUncheckedIndexedAccess`
- Zod als einzige Laufzeitvalidierung
- Vitest fuer Unit-, Integrations- und Golden-Tests
- ESLint mit einer Boundary-Regel, die verhindert, dass die Engine Frontend-
  oder Datenbankcode importiert
- pnpm, ESM, `@/`-Pfad-Alias
- eine projekteigene `CLAUDE.md` mit expliziten Arbeitsregeln

## 3. Wiederverwendbare Bestandteile

Wiederverwendbar ist die **Bauweise**, nicht der Code:

- Toolchain (Node 22, pnpm, TypeScript strict, Zod, Vitest, ESLint) — uebernommen
- Das Muster "Teilprojekt im Unterverzeichnis mit eigener `package.json` und
  eigener `CLAUDE.md`" — uebernommen
- Die ESLint-Boundary-Regel als Architekturschutz — uebernommen und auf die
  Schichten dieser Plattform angepasst
- Der Umgang mit Statusmarkierungen (`[ANNAHME]`, `[OFFEN]`) — entspricht dem
  hier geforderten `FACT`/`INFERENCE`/`ASSUMPTION`/`UNKNOWN`

Nicht wiederverwendbar: die Engine-Module selbst (Weltsimulation, RNG, Agenten).
Sie loesen ein anderes Problem.

## 4. Technische Probleme und Risiken

1. **Vermischte Zwecke im selben Repository.** Ein Plugin-Fork, eine Simulation
   und eine Intelligence-Plattform teilen sich eine Historie. Solange die
   Teilprojekte in eigenen Verzeichnissen liegen, ist das beherrschbar; ohne
   diese Trennung waere es das nicht.
2. **Upstream-Divergenz.** Der Fork wird bei einem Merge von `obra/superpowers`
   Konflikte erzeugen, wenn wir Dateien der Wurzel anfassen. Deshalb: Wurzel
   nicht anfassen. Die Wurzel-`CLAUDE.md` enthaelt Beitragsregeln fuer das
   Upstream-Projekt und gilt fuer Pull Requests dorthin — nicht fuer dieses
   Teilprojekt.
3. **Keine Datenhaltung, kein Frontend, keine Pipeline.** Alles ist neu zu bauen.
4. **Datenqualitaet ist das eigentliche Risiko, nicht die Technik.** Ein System,
   das Geruechte wie Vollzuege darstellt oder Unternehmen dreifach fuehrt, ist
   falsch, egal wie sauber der Code ist.

## 5. Fehlende Komponenten fuer das Zielsystem

| Komponente | Status |
| --- | --- |
| Datenmodell (Company, Deal, Ownership, Asset, Commodity, Source, Event) | **umgesetzt** (Schritt 1) |
| Identitaet und Namensnormalisierung | **umgesetzt** (Schritt 1) |
| Confidence-Berechnung | offen (Schritt 2) |
| Import-Pipeline mit Review Queue | offen (Schritt 2/3) |
| Entity Resolution mit Kandidatensuche | offen (Schritt 3) |
| Persistenz (JSON-Store, Laden/Schreiben, referentielle Pruefung) | offen (Schritt 4) |
| Deutschland-Karte mit Filtern | offen (Schritt 5) |
| Europa-Erweiterung, Assets/Minen, News-Automatisierung | spaetere Phasen |

## 6. Empfohlenes Datenmodell

Sieben Entitaeten, ein Knotentyp fuer alle Akteure, Belegspur an jedem
inhaltlichen Datensatz. Vollstaendig beschrieben in `data-schema.md`, ausgefuehrt
in `../src/domain/`. Die drei tragenden Entscheidungen:

- **Ein Akteursknoten statt mehrerer Tabellen.** Personen, Staaten, Stiftungen
  und Fonds sind `Company`-Datensaetze mit passendem `entity_type`. Der
  Eigentuemergraph bleibt dadurch homogen.
- **`null` statt fehlender Felder.** Jedes Feld ist Pflicht; unbekannte Werte
  sind ausdruecklich `null`. Eine Luecke ist damit sichtbar statt stillschweigend.
- **Zod ist die einzige Wahrheit ueber die Datenform.** TypeScript-Typen werden
  abgeleitet, nicht parallel gepflegt.

## 7. Empfohlene Architektur

Vier Schichten, durch Verzeichnisse und eine ESLint-Boundary getrennt:

```
domain/   reine Typen, Schemas, Identitaet, Confidence — kennt niemanden
ingest/   Validierung, Entity Matching, Dedupe, Review Queue — kennt domain
store/    Laden und Schreiben der JSON-Datenbank — kennt domain
cli/      Kommandos fuer Import, Pruefung, Export — kennt alles
web/      statische Karte, verbraucht ein exportiertes Bundle
```

Details und Begruendungen in `architecture.md`, die schwer umkehrbaren
Entscheidungen in `decisions.md`.

## 8. Migrationsplan

Es gibt nichts zu migrieren. Der Plan ist deshalb ein Aufbauplan, und er beruehrt
weder `skills/` noch `ai-battle-royale/`. Alles Neue liegt unter
`ma-intelligence/`.

## 9. Phase 1 — Deutschland

Abgeschlossen ist Phase 1, wenn:

1. Ein von GPT geliefertes JSON mit deutschen Deals importiert werden kann und
   dabei gegen Schema, Quellen und Dubletten geprueft wird.
2. Unsichere Faelle in einer Review Queue landen statt in der Datenbank.
3. Die Datenbank als JSON in Git liegt und referentiell konsistent ist.
4. Eine Karte alle erfassten deutschen Deals zeigt, mit Filtern nach Branche,
   Dealstatus und Zeitraum.
5. Geruechte und Verkaufsprozesse auf der Karte sofort von bestaetigten Deals zu
   unterscheiden sind.
6. Ein Deal-Detail Kaeufer, Ziel, Status, Wert und **alle Quellen** zeigt.

Keine Europa-Erweiterung, bevor das steht.

## 10. Naechste fuenf Entwicklungsschritte

1. **Datenmodell** — Schemas, IDs, Namensnormalisierung, Tests. *(erledigt)*
2. **Confidence und Validierungsregeln** — Quellenbewertung, Score-Berechnung,
   semantische Regeln (z. B. "vollzogen ohne Vollzugsdatum"), Publikationsgate.
3. **Import-Pipeline** — GPT-Datensatz einlesen, Entity Matching gegen den
   Bestand, Dubletten erkennen, Review Queue schreiben.
4. **Store und CLI** — JSON-Datenbank laden/schreiben, referentielle Integritaet
   pruefen, `import`-, `check`- und `export`-Kommando.
5. **Deutschland-Karte** — statisches Frontend auf dem exportierten Bundle mit
   den Filtern aus Phase 1.
