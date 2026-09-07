# M&A- und Rohstoff-Intelligence-Plattform

Ein System ueber Unternehmen, Uebernahmen, Eigentuemerstrukturen,
Produktionsstandorte und Rohstoffe. Es beantwortet Fragen wie "wem gehoert
dieses Werk, ueber welche Kette, und was wurde dort zuletzt gekauft" — die Karte
ist eine Sicht darauf, nicht der Zweck.

**Phase 1 ist Deutschland.** Europa, Rohstoffunternehmen, Assets und die
News-Automatisierung folgen erst, wenn die deutsche Basis traegt.

## Stand

Schritt 1 von 5 ist umgesetzt: das Datenmodell mit Identitaet, Vokabularen und
Validierung. Es gibt noch keine Import-Pipeline, keine Datenbank und keine
Karte. Der aktuelle Stand steht immer in [`agent/CURRENT_STATE.md`](agent/CURRENT_STATE.md).

## Dokumentation

| Datei | Inhalt |
| --- | --- |
| [`docs/analysis.md`](docs/analysis.md) | Bestandsaufnahme, Zielarchitektur, Aufbauplan |
| [`docs/architecture.md`](docs/architecture.md) | Schichten, Datenfluss, was vorbereitet ist |
| [`docs/data-schema.md`](docs/data-schema.md) | Die sieben Entitaeten im Detail |
| [`docs/research-rules.md`](docs/research-rules.md) | Regeln fuer Daten und Recherche |
| [`docs/decisions.md`](docs/decisions.md) | Architekturentscheidungen mit Begruendung |
| [`agent/GPT_HANDOFF.md`](agent/GPT_HANDOFF.md) | Was GPT liefern soll und in welchem Format |
| [`agent/CLAUDE_HANDOFF.md`](agent/CLAUDE_HANDOFF.md) | Einstieg fuer die naechste Claude-Sitzung |

## Aufbau

```
src/domain/    Typen, Schemas, IDs, Namensnormalisierung   (kennt niemanden)
src/ingest/    Validierung, Entity Matching, Review Queue  (noch leer)
src/store/     Laden und Schreiben der JSON-Datenbank      (noch leer)
src/cli/       Kommandos                                    (noch leer)
data/intelligence/
  incoming/    Rohlieferungen, unvalidiert
  verified/    geprueft, das ist die Datenbank
  rejected/    abgelehnt, mit Begruendung
tests/         Vitest
```

## Kommandos

```bash
pnpm install
pnpm test        # Vitest
pnpm typecheck   # tsc --noEmit
pnpm lint        # ESLint inkl. Schichtgrenzen
pnpm check       # alle drei
```

Node 22 oder neuer, pnpm.

## Verhaeltnis zum uebrigen Repository

Dieses Verzeichnis ist eigenstaendig. `skills/`, `hooks/` und die Wurzel gehoeren
zum Superpowers-Plugin-Fork, `ai-battle-royale/` ist ein unabhaengiges Projekt.
Nichts davon wird von hier aus veraendert (siehe `docs/decisions.md` #1).
