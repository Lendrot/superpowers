# Aktueller Stand

Letzte Aktualisierung: 2026-09-07
Branch: `claude/ma-intelligence-platform-7s9wv4`

## Projektstand in einem Satz

Das Datenmodell steht und ist getestet; Import-Pipeline, Datenbank und Karte
gibt es noch nicht.

## Was umgesetzt ist

**Schritt 1 von 5 — Datenmodell.**

- Sieben Entitaeten als Zod-Schemas: Company, Deal, Ownership, Asset, Commodity,
  Source, Event, dazu die Gesamtstruktur `intelligenceDatabaseSchema`.
- Kontrollierte Vokabulare fuer Dealstatus, Dealtyp, Branche, Assettyp,
  Betriebsstatus, Rohstoffkategorie, Quellentyp, Ereignistyp, Belegstatus —
  mit deutschen Labels fuer Branchen und Dealstatus.
- Lesbare, inhaltsabgeleitete IDs (`company_basf_se`,
  `deal_<ziel>__<kaeufer>__<jahr>`) und Erkennungsfunktionen dafuer.
- Namensnormalisierung als Grundlage der Entity Resolution: "BASF SE", "BASF"
  und "BASF Group" ergeben dieselbe Vergleichsform.
- Stabile Fingerabdruecke (kanonisches JSON + sha256) fuer IDs und die spaetere
  Dublettenerkennung.
- 46 Unit-Tests, `pnpm check` (Typecheck, Lint, Tests) gruen.
- ESLint-Boundary: `domain` kennt keine Dateien und keine anderen Schichten,
  `ingest` darf nicht persistieren, beide sind frei von Wanduhr und Zufall.

**Dokumentation.** `docs/analysis.md` (Bestandsaufnahme und Plan),
`architecture.md`, `data-schema.md`, `research-rules.md`, `decisions.md`
(sechs Entscheidungen), `agent/GPT_HANDOFF.md` (Lieferformat fuer GPT).

## Relevante Dateien

| Datei | Rolle |
| --- | --- |
| `src/domain/entities.ts` | Die verbindliche Form aller Daten |
| `src/domain/vocabulary.ts` | Alle kontrollierten Listen |
| `src/domain/ids.ts` | ID-Vergabe und -Erkennung |
| `src/domain/naming.ts` | Namens- und Domainnormalisierung |
| `src/domain/types.ts` | Aus den Schemas abgeleitete Typen |
| `eslint.config.js` | Die Schichtgrenzen, maschinell erzwungen |
| `docs/decisions.md` | Warum es so und nicht anders gebaut ist |

## Wichtige Architekturentscheidungen

1. Eigenstaendiges Teilprojekt unter `ma-intelligence/`; Wurzel und
   `ai-battle-royale/` bleiben unberuehrt.
2. JSON in Git als Datenbank — jede Datenaenderung ist ein pruefbarer Diff.
3. Ein Akteursknoten (`Company` mit `entity_type`) fuer Unternehmen, Personen,
   Staaten, Stiftungen und Fonds.
4. `snake_case` in JSON und TypeScript — keine Mapping-Schicht.
5. Pflichtfelder mit `null` fuer Unbekanntes, `.strict()` gegen Fremdfelder.
6. Zod als einzige Wahrheit ueber die Datenform, Typen per `z.infer`.

Begruendungen mit Alternativen und Umkehrbarkeit in `docs/decisions.md`.

## Bekannte Luecken und offene Punkte

- **`confidence` wird noch von niemandem berechnet.** Das Feld existiert und ist
  validiert, die Berechnung ist Schritt 2.
- **Keine Persistenz.** `data/intelligence/` ist angelegt und leer. Referentielle
  Integritaet (zeigt jede `source_id` auf eine existierende Quelle?) ist noch
  nirgends geprueft — das gehoert in den Store-Schritt.
- **Kein Fuzzy-Matching.** Namensnormalisierung erkennt Schreibvarianten, aber
  keine Tippfehler. Bewusst so: ein unscharfer Treffer ist eine Behauptung und
  gehoert in die Review Queue, nicht in eine Normalisierungsfunktion.
- **Dealwerte ohne Kontext.** `deal_value` unterscheidet nicht zwischen
  Unternehmenswert und Eigenkapitalwert. Erst noetig, wenn Werte verglichen
  werden sollen; vorher ist es unnoetige Komplexitaet.
- **Keine Geokodierung.** Koordinaten muessen mitgeliefert werden. Ob ein
  Geocoder dazukommt, ist offen — er wuerde eine externe Abhaengigkeit bedeuten.

## Naechster sinnvoller Schritt

**Schritt 2: Confidence und Validierungsregeln** (`src/domain/confidence.ts`,
`src/ingest/rules.ts`).

Inhalt:

- Ausgangszuverlaessigkeit je `source_type` (Register und Pflichtmitteilung
  hoch, Analystenbericht niedriger).
- Score aus bester Quelle plus unabhaengiger Bestaetigung; Deckelung fuer
  unbestaetigte Dealstatus (ein Geruecht erreicht nie 90).
- Semantische Regeln mit Schweregrad, die das Schema nicht ausdruecken kann:
  `completed` ohne `completion_date`, Datensatz ohne Quellen, `evidence: FACT`
  ohne Beleg, `regulatory_review` ohne Ankuendigungsdatum.
- Publikationsgate: was unter 50 liegt oder `ASSUMPTION` ist, wird nicht
  veroeffentlicht.

Danach Schritt 3 (Import-Pipeline mit Review Queue), 4 (Store und CLI),
5 (Deutschland-Karte). Reihenfolge und Umfang in `docs/analysis.md` §10.
