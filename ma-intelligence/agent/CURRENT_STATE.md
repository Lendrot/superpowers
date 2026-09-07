# Aktueller Stand

Letzte Aktualisierung: 2026-09-07
Branch: `claude/ma-intelligence-platform-7s9wv4`

## Projektstand in einem Satz

**Deutschland-M&A-V1 laeuft**: von der recherchierten Lieferung ueber Validierung,
Entity Matching und geprueften Bestand bis zur Karte mit Marker, Detailansicht,
Quellenlink und den drei Filtern — auf der bestehenden Website, die unveraendert
erhalten geblieben ist. Der Bestand traegt jetzt **16 Transaktionen mit
Deutschlandbezug**, darunter die sieben deutschen Beziehungen aus dem
Marktatlas-Stand v004. Kein AI-Reviewer ist angebunden; die Review-Loop-
Infrastruktur ruht auftragsgemaess.

## Wichtig fuer den Einstieg

Die **bestehende Website ist die Ausgangsbasis** und liegt unter `site/`
(Marktatlas v004 Deutschland, Stand 2026-09-07): 3D-Globus, 2D-Weltkarte, dazu
der Marktdatensatz `market-data.json` mit 10.207 Unternehmens-/Aktieneintraegen
(327 mit Standort in Deutschland) und 31 Beziehungen, alle Bibliotheken lokal
gebuendelt. Der aeltere `companies.json` mit 9.868 Wikidata-Unternehmen liegt
unveraendert daneben; v004 hat ihn nicht angefasst. Die Website wurde
erweitert, nicht ersetzt: hinzugekommen ist allein
`site/dist/deutschland/`. Ihre Analyse steht in
`docs/bestandsaufnahme-website.md`.

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

**Deutschland-M&A-V1 (Schritte 2 bis 5).**

- **Store**: `loadDatabase`/`saveDatabase` mit Schemapruefung und referentieller
  Integritaet (gebrochene Verweise, doppelte IDs, Belege ohne Quelle am
  Subjekt); Warnungen fuer unvollstaendige Erfassung. Sortiert und formatiert
  geschrieben, damit der Git-Diff lesbar bleibt.
- **Abfragen**: Filter nach Dealstatus, Branche, Zeitraum und Zielland;
  `dealView` loest Ziel, Parteien und Quellen auf. Ein Deal ohne Datum faellt
  sichtbar aus dem Zeitraumfilter, statt auf heute gesetzt zu werden.
- **Import-Pipeline**: Lieferformat mit `ref`-Schluesseln statt IDs, Aufloesung
  gegen den Marktatlas-Bestand ueber Wikidata-ID, sonst ueber einen belegten
  Ortsmittelpunkt. Ohne Beleg bleibt der Standort leer und wird gemeldet.
- **Datensatz**: 16 reale Transaktionen mit Deutschlandbezug, 21 Quellen und 15
  Einzelbelegen; 28 der 31 Unternehmen tragen einen belegten Standort.
  Grundstock sind neun eigene Recherchen, ausgewaehlt nach Fallunterscheidungen (vollzogen, angekuendigt, unterzeichnet,
  kartellrechtliche Pruefung, Verkaufsprozess, Geruecht; deutscher und
  auslaendischer Kaeufer; Beteiligungserhoehung; Carve-out; staatlicher
  Verkaeufer; offener Kaeufer). Dazu die sieben deutschen Beziehungen aus dem
  **Marktatlas-Bestand v004**, die dort noch fehlten (Holcim/Fermacell,
  VINCI/All for One, Henkel/Olaplex, Carlyle/Surventis, Persistent/Nagarro,
  BASF/AgBiTech, Henkel/Stahl). Ereignisdaten, Sitzangaben und Koordinaten
  aller zehn v004-Beziehungen stammen aus dessen Marktdatensatz
  (`docs/decisions.md` #20).
- **Karte**: `site/dist/deutschland/` — Deutschland hervorgehoben, Marker nach
  Status in Farbe **und Form** getrennt (bestaetigt gefuellt, unbestaetigt
  gestrichelt), Detailansicht mit Parteien, Anteilen, Belegstatus, Einzelbelegen
  und Quellenlinks, Filter fuer Status, Branche und Zeitraum.
- Import und Kartenexport sind deterministisch: zweimal derselbe Lauf ergibt
  bytegleiche Dateien.

**Review-Loop-Infrastruktur (Schritt A, ruht).** Nicht Teil der fuenf Fachschritte,
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
(22 Entscheidungen), `agent/GPT_HANDOFF.md` (Lieferformat fuer GPT).

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
| `docs/bestandsaufnahme-website.md` | Die bestehende Website: Aufbau, Daten, Probleme, Abgleich mit dem Modell |
| `site/` | Die Website. `site/dist/` wird ausgeliefert, `site/dist/deutschland/` ist die neue Ansicht |
| `data/intelligence/incoming/2026-09-deutschland-ma.json` | Die recherchierte Lieferung |
| `data/intelligence/verified/deutschland-ma.json` | Der gepruefte Bestand |
| `src/ingest/delivery.ts` | Lieferformat und Uebersetzung ins Datenmodell |
| `src/store/integrity.ts` | Referentielle Pruefung — was das Schema nicht sehen kann |
| `src/store/map-bundle.ts` | Was die Karte anzeigt, testbar ausserhalb des Browsers |
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
10. Deal traegt Parteilisten; Form und rechtliche Umsetzung sind zwei Achsen.
11. Eigentum an Standorten laeuft ueber `Ownership`, nicht ueber ein Feld am Asset.
12. `Claim` belegt einzelne Aussagen, ohne einen Knowledge-Graph zu bauen.
13. Die bestehende Website wird erweitert, nicht ersetzt.
14. Koordinaten nur aus belegten Quellen — sonst keine.
15. Import und Kartenexport sind deterministisch.
16. Deals mit deutschem Kaeufer und Ziel im Ausland werden gezaehlt und benannt,
    statt still aus der Karte zu fallen.
17. Der v004-Marktdatensatz ist der massgebliche Stand; abweichende eigene
    Werte bleiben als Anmerkung erhalten.
18. Die belegte Kaufabsicht ist ein eigener, unbestaetigter Dealstatus.
19. Jede Koordinate traegt ihre Quelle im Datensatz — vom Schema erzwungen.

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
- **Der Datensatz ist bewusst klein und nicht primaerverifiziert.** Die
  Primaerquellen liessen sich aus dem Buildcontainer nicht abrufen — der
  Egress-Proxy sperrt Unternehmens- und Medienseiten. Die Angaben stammen aus
  einem Websuchindex; jede Quelle ist mit URL erfasst und vor einer
  Veroeffentlichung am Original zu bestaetigen. Die Lieferung sagt das in
  `verification_note`, und die Confidence-Werte tragen dem Rechnung.
- **Zwei der 13 Deutschland-Deals haben keinen Standort**: FFG (Flensburg) und
  der ebm-papst-Geschaeftsbereich. Fuer beide fuehrt weder der Boersen-Snapshot
  noch der v004-Marktdatensatz eine belegte Koordinate. Sie stehen in der
  Liste, nicht auf der Karte.
- **Drei Transaktionen mit deutschem Kaeufer und Ziel im Ausland** (Olaplex,
  AgBiTech, Stahl) sind im Bestand, aber nicht auf der Karte: sie haengt am
  Zielunternehmen. Ihre Zahl steht als `meta.buyer_side_count` im Buendel und
  im Seitenkopf (`docs/decisions.md` #19).
- **Ein Deal bleibt undatiert** (Siemens/ebm-papst) und faellt sichtbar aus dem
  Zeitraumfilter. Alle uebrigen tragen jetzt ein Datum aus dem
  v004-Marktdatensatz.
- **Zwei Ankuendigungsdaten haben sich mit v004 geaendert** (Uber/Delivery Hero,
  Frasers/Hugo Boss). Moeglich, dass eigene Recherche und v004 verschiedene
  Ereignisse meinen; der frueher gefuehrte Wert steht in der Anmerkung des
  Deals (`docs/decisions.md` #20).
- **Der Importer kennt noch keine Review Queue.** Er legt jedes gelieferte
  Unternehmen neu an, statt es gegen den Bestand zu halten. Bei einer zweiten
  Lieferung entstehen dadurch Dubletten.
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

Die Deutschland-V1 steht. Bevor etwas Neues beginnt, sind das die naechsten
sinnvollen Schritte — in dieser Reihenfolge:

1. **Datensatz verbreitern.** 16 Transaktionen pruefen das Modell, sind aber
   keine Marktabdeckung. Die Pipeline traegt beliebig viele Lieferungen;
   noetig ist Recherche, kein Code. Der v004-Marktdatensatz fuehrt 31
   Beziehungen weltweit — die 21 ohne Deutschlandbezug sind bewusst nicht
   uebernommen, solange Phase 1 Deutschland ist (Regel 8).
2. **Sektoren aus v004 uebernehmen.** `market-data.json` fuehrt je Partei
   `sectors` und dazu `industrySourceUrl`. Unser `industry` kommt bis heute aus
   der Lieferung und ist unbelegt. Die Zuordnung der zehn v004-Sektoren auf die
   sechzehn Branchen des Modells ist die eigentliche Arbeit daran.
3. **Confidence-Berechnung** (`src/domain/confidence.ts`): heute wird die
   Confidence je Datensatz von Hand gesetzt. Sie sollte aus Quellentyp,
   Quellenzahl und Dealstatus folgen, mit Deckelung fuer unbestaetigte Status.
4. **Review Queue**: unsichere Entity-Matches und Widersprueche zum Bestand
   landen heute nirgends — der Importer legt jedes gelieferte Unternehmen neu
   an. Sobald zwei Lieferungen zusammenkommen, ist das die naechste echte
   Baustelle.
5. **Branchenklassifikation aus der Quelle**: `industry` kommt heute aus der
   Lieferung. Die SPARQL-Abfrage der Website koennte P452 mitholen.

Keine Europa- oder Rohstofferweiterung, bevor das steht. Die
Review-Loop-Infrastruktur ruht auftragsgemaess; was fuer eine echte Anbindung
fehlt, steht in `docs/review-loop.md`.
