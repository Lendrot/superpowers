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
