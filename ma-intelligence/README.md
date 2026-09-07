# M&A- und Rohstoff-Intelligence-Plattform

Ein System ueber Unternehmen, Uebernahmen, Eigentuemerstrukturen,
Produktionsstandorte und Rohstoffe. Es beantwortet Fragen wie "wem gehoert
dieses Werk, ueber welche Kette, und was wurde dort zuletzt gekauft" — die Karte
ist eine Sicht darauf, nicht der Zweck.

**Phase 1 ist Deutschland.** Europa, Rohstoffunternehmen, Assets und die
News-Automatisierung folgen erst, wenn die deutsche Basis traegt.

## Stand

**Deutschland-M&A-V1 laeuft.** Von der recherchierten Lieferung ueber
Schemapruefung, Standortaufloesung und referentielle Kontrolle bis zur Karte mit
Marker, Detailansicht, Quellenlink und Filtern nach Dealstatus, Branche und
Zeitraum. Geruechte sind von bestaetigten Transaktionen in Farbe **und Form**
unterschieden.

Die bestehende Website (Marktatlas v003) ist die Ausgangsbasis und liegt
unveraendert unter [`site/`](site/); die Deutschland-Ansicht ist als neue Seite
dazugekommen. Der aktuelle Stand steht immer in
[`agent/CURRENT_STATE.md`](agent/CURRENT_STATE.md).

## Dokumentation

| Datei | Inhalt |
| --- | --- |
| [`docs/analysis.md`](docs/analysis.md) | Bestandsaufnahme, Zielarchitektur, Aufbauplan |
| [`docs/architecture.md`](docs/architecture.md) | Schichten, Datenfluss, was vorbereitet ist |
| [`docs/data-schema.md`](docs/data-schema.md) | Die sieben Entitaeten im Detail |
| [`docs/research-rules.md`](docs/research-rules.md) | Regeln fuer Daten und Recherche |
| [`docs/decisions.md`](docs/decisions.md) | Architekturentscheidungen mit Begruendung |
| [`docs/bestandsaufnahme-website.md`](docs/bestandsaufnahme-website.md) | Die bestehende Website: Aufbau, Daten, Probleme, Abgleich |
| [`docs/review-loop.md`](docs/review-loop.md) | PR → CI → AI-Review → Fix: was laeuft, was Mock ist |
| [`agent/GPT_HANDOFF.md`](agent/GPT_HANDOFF.md) | Was GPT liefern soll und in welchem Format |
| [`agent/CLAUDE_HANDOFF.md`](agent/CLAUDE_HANDOFF.md) | Einstieg fuer die naechste Claude-Sitzung |

## Aufbau

```
src/domain/    Typen, Schemas, IDs, Namensnormalisierung   (kennt niemanden)
src/ingest/    Lieferformat und Uebersetzung ins Datenmodell
src/store/     Laden, Schreiben, referentielle Pruefung, Abfragen, Kartenbuendel
src/cli/       Kommandos: import:delivery, build:map, review
src/review/    Review-Loop: Findings, Urteile, Rundenschutz, Audit (ruht)
site/          Die Website. site/dist/ wird ausgeliefert,
               site/dist/deutschland/ ist die Deutschland-Ansicht
data/intelligence/
  incoming/    Rohlieferungen, unvalidiert
  verified/    geprueft, das ist die Datenbank
  rejected/    abgelehnt, mit Begruendung
review-log/    Audit Trail der Review-Runden
tests/         Vitest
```

## Kommandos

```bash
pnpm install
pnpm import:delivery data/intelligence/incoming/2026-09-deutschland-ma.json
pnpm build:map   # gepruefte Datenbank -> site/dist/assets/deutschland-ma.json
npx http-server site/dist -p 8099   # dann http://127.0.0.1:8099/deutschland/

pnpm test        # Vitest
pnpm typecheck   # tsc --noEmit
pnpm lint        # ESLint inkl. Schichtgrenzen
pnpm check       # alle drei
pnpm review      # Review-Loop: validate | next | audit
```

Node 22 oder neuer, pnpm.

## Verhaeltnis zum uebrigen Repository

Dieses Verzeichnis ist eigenstaendig. `skills/`, `hooks/` und die Wurzel gehoeren
zum Superpowers-Plugin-Fork, `ai-battle-royale/` ist ein unabhaengiges Projekt.
Nichts davon wird von hier aus veraendert (siehe `docs/decisions.md` #1).
