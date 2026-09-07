# Aktueller Stand

Letzte Aktualisierung: 2026-09-07
Branch: `claude/ma-intelligence-platform-7s9wv4`

## Projektstand in einem Satz

Das Datenmodell steht, und die Infrastruktur fuer einen kontrollierten
Review-Loop (CI-Gate, Findings-Format, Fix-Regeln, Rundenbegrenzung, Audit
Trail) steht ebenfalls — Import-Pipeline, Datenbank und Karte gibt es noch
nicht, und **kein AI-Reviewer ist angebunden**.

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

**Review-Loop-Infrastruktur (Schritt A).** Nicht Teil der fuenf Fachschritte,
sondern das Geruest fuer den Arbeitsablauf PR → CI → externes AI-Review →
Findings → Fix → erneutes Review.

- CI-Gate fuer Pull Requests: Install, Typecheck, Lint, Tests, jeweils als
  eigener Schritt (`.github/workflows/ma-intelligence-ci.yml`, auf
  `ma-intelligence/**` beschraenkt).
- Maschinenlesbares Findings-Format mit vier Schweregraden und acht Kategorien,
  inklusive Pfadpruefung (keine absoluten Pfade, kein `..`) und Auswertung
  beschaedigter Modellantworten, die nie wirft.
- Fix Contract: zu jedem Finding genau ein Urteil `ACCEPTED`/`REJECTED` mit
  tragender Begruendung; fehlende, doppelte oder erfundene Urteile eskalieren.
- Loop-Schutz: `MAX_REVIEW_ROUNDS = 3`, ein Wiederholungsversuch bei
  unbrauchbarer Antwort, Eskalation an `HUMAN_REVIEW_REQUIRED`.
- Abbruch, wenn eine Fix-Runde Tests uebersprungen oder entfernt hat.
- Audit Trail als Datenmodell und als Markdown, mit angenommenen *und*
  abgelehnten Findings, Testergebnis und verbleibenden Risiken.
- Anbieterneutrale Reviewer-Schnittstelle plus Mock; ein nicht angebundener
  Provider wirft mit der Liste dessen, was fehlt, statt etwas zu simulieren.
- Kommandozeile `pnpm review validate|next|audit`.
- 80 Tests allein fuer den Loop; Gesamtsuite 126 Tests gruen.

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
| `docs/review-loop.md` | Der Review-Loop: was IMPLEMENTED, MOCKED und NOT YET CONNECTED ist |
| `src/review/loop.ts` | Zustandsmaschine des Loops — die einzige Stelle, die entscheidet, ob weitergemacht wird |
| `src/review/findings.ts` | Findings-Format und Auswertung der Reviewer-Antwort |
| `src/review/provider.ts` | Reviewer-Schnittstelle, anbieterneutral |
| `.github/workflows/ma-intelligence-ci.yml` | CI-Gate fuer Pull Requests |

## Wichtige Architekturentscheidungen

1. Eigenstaendiges Teilprojekt unter `ma-intelligence/`; Wurzel und
   `ai-battle-royale/` bleiben unberuehrt.
2. JSON in Git als Datenbank — jede Datenaenderung ist ein pruefbarer Diff.
3. Ein Akteursknoten (`Company` mit `entity_type`) fuer Unternehmen, Personen,
   Staaten, Stiftungen und Fonds.
4. `snake_case` in JSON und TypeScript — keine Mapping-Schicht.
5. Pflichtfelder mit `null` fuer Unbekanntes, `.strict()` gegen Fremdfelder.
6. Zod als einzige Wahrheit ueber die Datenform, Typen per `z.infer`.
7. CI-Workflow in der Repository-Wurzel — die begruendete Ausnahme zu 1.
8. Anbieterneutrale Reviewer-Schnittstelle statt SDK-Anbindung.
9. Der Review-Loop kennt keine Merge-Aktion; sein bester Ausgang ist
   `READY_FOR_HUMAN_MERGE`.

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
- **Kein AI-Reviewer angebunden.** Es gibt keine Zugangsdaten und keinen
  Adapter fuer ein Modell. Der Mock weist sich in jedem Audit als Mock aus. Was
  fuer die echte Anbindung fehlt, steht in `docs/review-loop.md`.
- **Das CI-Gate blockiert erst, wenn es als Required Status Check eingetragen
  ist.** Das ist eine Branch-Protection-Einstellung von `main` und laesst sich
  nicht aus einer Datei heraus setzen.
- **Der Loop wird nicht automatisch angestossen.** Er wird aus einer Sitzung
  heraus gefahren; ein Ausloeser aus GitHub heraus existiert nicht.
- **Keine Datenvalidierung in der CI.** Es gibt noch keinen Store, der zu
  pruefende Daten haelt — der Schritt kommt mit Schritt 4.
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

Die Review-Loop-Infrastruktur aendert an dieser Reihenfolge nichts — sie ist das
Geruest, in dem die naechsten Schritte gepruefte Pull Requests werden. Ihre
eigene offene Aufgabe ist die Anbindung eines echten Reviewers; was dafuer
fehlt, steht in `docs/review-loop.md`.
