# Architekturentscheidungen

Format je Eintrag: DECISION / WHY / ALTERNATIVES / TRADEOFFS / REVERSIBLE.
Schwer umkehrbare Entscheidungen werden nur getroffen, wenn sie noetig sind.

## 1 — Eigenstaendiges Teilprojekt unter `ma-intelligence/`

**DECISION:** Die Plattform liegt vollstaendig in `ma-intelligence/` mit eigener
`package.json`, eigener Toolchain und eigener `CLAUDE.md`. Wurzelverzeichnisse
(`skills/`, `hooks/`, `docs/`, `tests/`) und `ai-battle-royale/` bleiben unberuehrt.

**WHY:** Das Repository ist ein Fork von `obra/superpowers`. Aenderungen an der
Wurzel erzeugen Konflikte bei jedem Upstream-Merge. `ai-battle-royale/` zeigt,
dass das Repository dieses Muster bereits traegt.

**ALTERNATIVES:** (a) Eigenes Repository — sauberer, aber der Auftrag verweist
ausdruecklich auf dieses Repository als technische Wahrheit. (b) Aufbau in der
Wurzel — dauerhafte Konfliktquelle.

**TRADEOFFS:** Ein Repository mit drei Zwecken. Beherrschbar, solange die
Verzeichnisgrenze gilt.

**REVERSIBLE:** YES — das Verzeichnis laesst sich mit Historie herausloesen.

## 2 — JSON-Dateien in Git als Datenbank

**DECISION:** Der Datenbestand liegt als validiertes JSON unter
`data/intelligence/`. Keine Datenbank in Phase 1.

**WHY:** Jede Datenaenderung wird ein Diff und damit pruefbar — das ist bei einem
System, dessen Hauptrisiko falsche Daten sind, mehr wert als Abfragekomfort.
Die erwartete Groessenordnung (Hunderte bis Zehntausende Datensaetze) passt
muehelos in den Speicher.

**ALTERNATIVES:** (a) SQLite — bessere Abfragen, aber Binaerdateien sind im Diff
unlesbar und die Datenmenge rechtfertigt es nicht. (b) PostgreSQL mit PostGIS —
loest Probleme, die wir nicht haben, und kostet Betrieb. (c) Graphdatenbank —
dasselbe, staerker.

**TRADEOFFS:** Keine indizierten Abfragen; alles laeuft ueber Filterung im
Speicher. Ab etwa 100.000 Datensaetzen oder bei nebenlaeufigen Schreibern traegt
das nicht mehr.

**REVERSIBLE:** YES — die Schemas sind speicherunabhaengig, ein Import in SQLite
oder Postgres ist ein Skript. Der Umstieg ist ausdruecklich vorgesehen, sobald
eines der genannten Kriterien eintritt.

## 3 — Ein Akteursknoten statt getrennter Typen

**DECISION:** Unternehmen, Personen, Familienbueros, Stiftungen, Fonds und
Staaten sind `Company`-Datensaetze mit `entity_type`.

**WHY:** Im Eigentuemergraphen verhalten sie sich gleich. Getrennte Typen wuerden
jede Kante und jede Abfrage vervielfachen, ohne etwas zu gewinnen.

**ALTERNATIVES:** Getrennte Entitaeten `Person` und `Institution` mit
polymorphen Kanten.

**TRADEOFFS:** `Company` traegt Felder, die fuer eine Person leer bleiben
(`legal_name` = Name, `identifiers` = null). Der Name `Company` ist fuer einen
Personendatensatz leicht irrefuehrend.

**REVERSIBLE:** YES — eine Aufspaltung ist eine Migration ueber `entity_type`.

## 4 — `snake_case` im ganzen Stack

**DECISION:** Feldnamen sind im JSON *und* im TypeScript-Modell `snake_case`.

**WHY:** Austauschformat und internes Modell sind dieselbe Struktur. Damit
entfaellt eine Mapping-Schicht, die bei sieben Entitaeten und dutzenden Feldern
die haeufigste Stelle fuer stille Datenverluste waere.

**ALTERNATIVES:** `camelCase` intern mit Konvertierung an der Grenze.

**TRADEOFFS:** Unueblich in TypeScript.

**REVERSIBLE:** YES — mechanische Umbenennung, allerdings breit.

## 5 — Pflichtfelder mit `null` statt optionaler Felder

**DECISION:** Jedes Feld muss vorhanden sein; Unbekanntes ist ausdruecklich
`null`. Zusaetzlich `.strict()`: unbekannte Felder werden abgelehnt.

**WHY:** Ein fehlender Schluessel laesst offen, ob jemand nachgesehen hat. Ein
`null` ist eine Aussage. Das ist die technische Umsetzung von "nichts erfinden".

**ALTERNATIVES:** Optionale Felder — bequemer beim Befuellen, unklarer beim Lesen.

**TRADEOFFS:** Importdatensaetze werden laenger; GPT muss alle Felder ausgeben.

**REVERSIBLE:** YES — pro Feld aenderbar.

## 6 — Zod als einzige Wahrheit ueber die Datenform

**DECISION:** Schemas in Zod, TypeScript-Typen daraus abgeleitet.

**WHY:** Ein zweites, handgeschriebenes Typmodell driftet — und zwar genau an
der Stelle, an der die Validierung etwas durchlaesst, das der Compiler fuer
unmoeglich haelt.

**ALTERNATIVES:** Interfaces plus separate Validierung; JSON Schema als Quelle
mit Codegenerierung.

**TRADEOFFS:** Zod ist eine Laufzeitabhaengigkeit. Sie ist im Repository bereits
etabliert (`ai-battle-royale`).

**REVERSIBLE:** YES.

## 7 — CI-Workflow in `.github/workflows/`, entgegen Entscheidung 1

**DECISION:** `.github/workflows/ma-intelligence-ci.yml` liegt in der Wurzel des
Repositorys, obwohl Entscheidung 1 die Wurzel fuer unberuehrt erklaert. Der
Workflow ist auf Pfade unter `ma-intelligence/**` beschraenkt.

**WHY:** GitHub Actions liest Workflows ausschliesslich aus
`.github/workflows/`. Ein CI-Gate fuer Pull Requests ist ohne diese Datei nicht
moeglich. Das Konfliktrisiko ist gering: die Datei ist neu, upstream existiert
sie nicht, und keine bestehende Datei wird geaendert.

**ALTERNATIVES:** (a) Kein CI-Gate — dann bleibt der Workflow ein Vorsatz.
(b) Pruefung nur lokal ueber `pnpm check` — haengt daran, dass sie jemand
ausfuehrt, und blockiert keinen PR.

**TRADEOFFS:** Der erste Eingriff in die Wurzel. Bei einem Upstream-Merge ist
die Datei zusaetzlicher Inhalt, kein Konflikt.

**REVERSIBLE:** YES — Datei loeschen.

## 8 — Anbieterneutrale Reviewer-Schnittstelle statt SDK-Anbindung

**DECISION:** Ein Reviewer ist ein Objekt mit `id`, `status` und
`review(request) → Text`. Kein SDK, kein Anbietername, keine Modellwahl im
Loop. Angebunden ist heute nur ein Mock, der sich als solcher ausweist.

**WHY:** Der Loop soll den Anbieter ueberleben. Und solange keine Zugangsdaten
vorliegen, ist die ehrliche Umsetzung ein Mock, der sich Mock nennt — kein
Adapter, der so tut, als koennte er ein Modell erreichen.

**ALTERNATIVES:** (a) Direkte Anbindung an ein SDK — schneller, koppelt aber
Loop und Anbieter und braucht Zugangsdaten, die es nicht gibt. (b) Warten, bis
Zugangsdaten da sind — dann bleibt die Mechanik ungetestet.

**TRADEOFFS:** Die Antwort ist Text und wird erst danach validiert. Das ist
gewollt: eine Modellantwort ist unvertrauenswuerdige Eingabe, und die Pruefung
gehoert an eine Stelle, nicht in jeden Adapter.

**REVERSIBLE:** YES — ein Adapter ist eine Datei mit einer Methode.

## 9 — Der Loop kennt keine Merge-Aktion

**DECISION:** Die Zustandsmaschine kann `READY_FOR_HUMAN_MERGE` oder
`HUMAN_REVIEW_REQUIRED` ergeben, aber keine Aktion, die schreibt, zusammenfuehrt
oder freigibt.

**WHY:** Eine Sicherheitsregel, die nur in der Dokumentation steht, ist eine
Bitte. Fehlt der Zustand, kann kein Pfad ihn erreichen — auch keiner, den
spaeter jemand versehentlich baut.

**ALTERNATIVES:** Auto-Merge unter Bedingungen (gruene CI, keine Findings). Das
verschiebt die Frage nur auf die Qualitaet der Bedingungen.

**TRADEOFFS:** Der letzte Schritt bleibt manuell, auch wenn alles gruen ist.

**REVERSIBLE:** YES, aber bewusst schwer: es braeuchte einen neuen Zustand,
eine neue Aktion und eine Aenderung an den Tests, die genau das ausschliessen.

## 10 — Deal mit Parteilisten statt fester Kaeufer- und Verkaeuferfelder

**DECISION:** `buyer_company_id`/`seller_company_id`/`seller_name` weichen zwei
Listen `buyers` und `sellers` aus `DealParty`-Objekten (`company_id` oder
`name`, dazu optional `share_percentage`).

**WHY:** Konsortien und Mehrfachverkaeufer sind in deutschen Transaktionen der
Normalfall, nicht die Ausnahme. Ein einzelnes Feld haette spaeter eine
destruktive Migration erzwungen — genau in dem Moment, in dem schon Daten da
sind. Jetzt kostet die Aenderung nichts, weil noch nichts gespeichert ist.

**ALTERNATIVES:** (a) Zusatzfelder `co_buyers[]` neben dem Hauptkaeufer — zwei
Wahrheiten ueber dieselbe Seite. (b) Eine eigene Tabelle `deal_parties` — sauber,
aber bei JSON-Speicherung nur zusaetzliche Verweise ohne Gewinn.

**TRADEOFFS:** Der haeufige Fall (ein Kaeufer) ist etwas umstaendlicher zu
schreiben. Ein unbekannter Kaeufer ist die leere Liste — das muss man wissen.

**REVERSIBLE:** YES, aber nach dem ersten Datenbestand teuer. Deshalb jetzt.

## 11 — Wirtschaftliche Form und rechtliche Umsetzung sind zwei Achsen

**DECISION:** `deal_type` (acquisition, majority_stake, merger, carve_out …) und
`transaction_structure` (share_deal, asset_deal, merger, mixed, unknown) sind
getrennte Felder. `asset_deal` ist aus `deal_type` entfernt worden. Dazu
`stake_before_percentage`, `stake_acquired_percentage`, `stake_after_percentage`.

**WHY:** Ein Carve-out kann als Share- oder als Asset-Deal umgesetzt werden;
beides in einen Wert zu pressen erzwingt spaeter eine Migration. Die drei
Anteilsfelder bilden Minderheitsbeteiligung, Mehrheitsuebernahme und
Beteiligungserhoehung ohne weitere Typwerte ab.

**ALTERNATIVES:** Ein kombiniertes Vokabular mit Werten wie
`carve_out_asset_deal` — kombinatorisch wachsend und nicht filterbar.

**TRADEOFFS:** Ein Feld mehr je Deal.

**REVERSIBLE:** YES.

## 12 — Eigentum an Standorten laeuft ueber Ownership, nicht ueber ein Feld am Asset

**DECISION:** `Asset.owner_id` entfaellt. `Ownership.owned_id` nimmt jetzt eine
Company- **oder** eine Asset-ID. `Asset.operator_id` bleibt als Betreiber.

**WHY:** Ein Werk hat regelmaessig mehrere Eigentuemer und wechselt sie. Ein
einzelnes Feld kann weder Miteigentum noch Historie. Ownership kann beides
bereits — es fehlte nur die Erlaubnis, auf einen Standort zu zeigen.

**ALTERNATIVES:** Eine zweite Beziehungstabelle nur fuer Assets — dieselbe Logik
zweimal.

**TRADEOFFS:** "Wem gehoert dieses Werk" ist kein Feldzugriff mehr, sondern eine
Abfrage.

**REVERSIBLE:** YES.

## 13 — Claim: Quellen belegen einzelne Aussagen

**DECISION:** Neben `source_ids` am Datensatz gibt es `Claim`-Datensaetze:
Subjekt, belegtes Feld, Aussage im Klartext, Quelle, Belegstatus, Confidence.

**WHY:** "Welche Quelle belegt, dass X 35 % an Y haelt?" ist die Frage, an der
sich dieses System messen lassen muss. Eine Liste von Quellen am Datensatz
beantwortet sie nicht.

**ALTERNATIVES:** (a) Quellen je Feld direkt am Datensatz — verdoppelt jedes
Feld. (b) Ein echter Knowledge-Graph mit Reifikation — loest ein Problem, das
wir nicht haben, und kostet dauerhaft Verstaendlichkeit.

**TRADEOFFS:** Zwei Ebenen der Quellenzuordnung. Regel dagegen: die Quelle eines
Claims muss auch in den `source_ids` seines Subjekts stehen (geprueft im Store).

**REVERSIBLE:** YES — Claims sind additiv, ohne sie funktioniert alles weiter.

## 14 — Event zeigt auf den Deal, ersetzt ihn nicht

**DECISION:** `Event` traegt keine Transaktionsfelder. Ein Ereignis vom Typ
`deal_*` muss mindestens einen Deal benennen.

**WHY:** Sonst gibt es zwei Wahrheiten ueber denselben Vorgang: den Kaufpreis am
Deal und noch einmal in der Meldung. Der Deal ist der strukturierte
Transaktionsdatensatz, das Event ist die Tatsache, dass an einem Tag etwas
gemeldet wurde.

**ALTERNATIVES:** Event als Verlaufsprotokoll des Deals — waere Event Sourcing
und damit deutlich mehr Maschinerie als noetig.

**TRADEOFFS:** Wer nur die Meldung hat und den Deal noch nicht angelegt hat, muss
ihn anlegen.

**REVERSIBLE:** YES.

## 15 — Koordinatengenauigkeit aus dem Marktatlas uebernommen

**DECISION:** `coordinate_accuracy` (`headquarters` | `locality` | `unknown`) an
Company und Asset.

**WHY:** Die bestehende Website trennt Standortbeleg und Transaktionsbeleg und
sagt zu jeder Koordinate, ob sie das Gebaeude oder nur den Ortsmittelpunkt
meint. Ohne diese Angabe wirkt ein Ortsmittelpunkt auf der Karte wie eine
Adresse.

**ALTERNATIVES:** Genauigkeit als Freitext in `notes` — nicht filterbar, nicht
pruefbar.

**TRADEOFFS:** Ein Pflichtfeld mehr; ohne Koordinate ist es `unknown`.

**REVERSIBLE:** YES.
