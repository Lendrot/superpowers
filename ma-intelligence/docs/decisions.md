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

## 16 — Die bestehende Website wird erweitert, nicht ersetzt

**DECISION:** Der gelieferte Projektstand (Marktatlas v003) liegt unveraendert
unter `site/`. Die Deutschland-Ansicht kommt als neue Seite `site/dist/deutschland/`
dazu und benutzt die bereits gebuendelten Bibliotheken und Geometrien mit. An
`app.js` und `globe-app.js` wurde je genau ein Navigationslink ergaenzt, sonst
nichts.

**WHY:** Die Website funktioniert, ist sorgfaeltig gebaut und traegt echte Daten
mit Quellen. Ein Neubau haette Wochen gekostet und nichts gewonnen. Der
Kartenstack (Leaflet, MarkerCluster, Natural-Earth-Geometrie) ist bereits lokal
gebuendelt — damit braucht auch die neue Seite weder CDN noch Kachelserver.

**ALTERNATIVES:** (a) Neue Anwendung mit eigenem Build (Vite, React) — mehr
Werkzeug, dieselbe Karte. (b) Die bestehende Weltkarte um Filter erweitern —
haette den vorhandenen, ungetesteten `app.js` umgebaut und die Weltkarte
gefaehrdet.

**TRADEOFFS:** Zwei Seiten mit aehnlicher Aufgabe und zwei Stylesheets. Die
neue Seite wiederholt etwas Layoutcode.

**REVERSIBLE:** YES — die neue Seite ist ein eigenes Verzeichnis plus zwei
Dateien in `assets/`.

## 17 — Koordinaten nur aus belegten Quellen, sonst keine

**DECISION:** Standorte kommen ausschliesslich aus dem vorhandenen
Wikidata-Snapshot: ueber die Wikidata-ID des Unternehmens oder ueber den
belegten Ortsmittelpunkt derselben Stadt. Gibt es beides nicht, bleibt der
Standort `null` und das Unternehmen erscheint nicht auf der Karte, sondern in
einer eigenen Liste.

**WHY:** Das ist die Regel, die der bisherige Projektstand schon hatte ("No
geographic coordinates are fabricated"), und sie ist richtig: ein geratener
Punkt auf einer Karte sieht aus wie eine Tatsache.

**ALTERNATIVES:** Geokodierungsdienst anbinden — externe Abhaengigkeit,
Schluessel, und eine weitere Quelle, deren Qualitaet zu bewerten waere.

**TRADEOFFS:** Sichtbare Luecken. Aktuell fehlen zwei von neun Transaktionen auf
der Karte, darunter eine der groessten (Deutz/FFG, weil fuer Flensburg keine
belegte Koordinate im Bestand liegt).

**REVERSIBLE:** YES.

## 18 — Import und Kartenexport sind deterministisch

**DECISION:** Der Importer nimmt den Zeitstempel aus der Lieferung
(`prepared_at`) statt aus der Wanduhr, und das Kartenbuendel datiert sich aus
dem juengsten `updated_at` des Bestands.

**WHY:** Zweimal derselbe Lauf muss dieselbe Datei ergeben. Sonst zeigt jeder
Git-Diff Zeitstempeländerungen, und die eigentliche Aenderung geht darin unter —
in einem Projekt, dessen Datenbank in Git liegt, ist das der ganze Vorteil.

**ALTERNATIVES:** Zeitstempel aus der Uhr und Diff-Rauschen hinnehmen.

**TRADEOFFS:** `accessed_at` einer Quelle ist damit der Recherchezeitpunkt, nicht
der Importzeitpunkt. Das ist die ehrlichere Angabe.

**REVERSIBLE:** YES.

## 19 — Deals mit deutschem Kaeufer werden gezaehlt, nicht versteckt

**DECISION:** Der erfasste Bestand folgt dem Auftragsumfang "deutsches
Zielunternehmen **oder** deutscher Kaeufer". Die Deutschlandkarte haengt
weiterhin am Zielunternehmen und zeigt deshalb nur die erste Haelfte. Wie viele
Deals dadurch fehlen, steht als `meta.buyer_side_count` im Kartenbuendel und als
Satz im Seitenkopf.

**WHY:** Mit dem v004-Bestand kamen erstmals Transaktionen dazu, in denen ein
deutscher Kaeufer im Ausland kauft (Henkel/Olaplex, BASF/AgBiTech,
Henkel/Stahl). Sie gehoeren zum Umfang, haben aber keinen deutschen Standort,
an dem ein Marker sinnvoll haengt. Sie stillschweigend wegzufiltern hiesse, eine
Zahl zu zeigen, die kleiner ist als der Bestand, ohne das zu sagen — genau die
Art stiller Luecke, die dieses Projekt sonst ueberall sichtbar macht.

**ALTERNATIVES:** (a) Umfang auf deutsche Ziele verengen — verwirft belegte
Daten. (b) Marker an den Sitz des deutschen Kaeufers setzen — dann bedeutet ein
Punkt auf der Karte zweierlei, und die Karte luegt ueber den Ort des Geschaefts.

**TRADEOFFS:** Drei belegte Transaktionen sind derzeit nur ueber den Bestand
erreichbar, nicht ueber die Oberflaeche. Das ist die kleinere Unehrlichkeit als
ein Marker am falschen Ort; eine eigene Ansicht "deutsche Kaeufer im Ausland"
bleibt moeglich.

**REVERSIBLE:** YES — `dealsWithBuyerFrom` liefert die Menge bereits.

## 20 — Der v004-Marktdatensatz ist der massgebliche Stand

**DECISION:** `site/dist/assets/market-data.json` aus dem Marktatlas-Stand v004
Deutschland ist die Leitquelle fuer Ereignisdaten, Sitzangaben und Koordinaten
der erfassten Beziehungen. Wo eigene Recherche und v004 auseinandergehen, gilt
v004; der frueher gefuehrte Wert bleibt in den Anmerkungen des Deals stehen.

**WHY:** Der Datensatz nennt zu jeder Partei den Ort, die Koordinate und die
Wikidata-Seite, aus der die Koordinate stammt, und zu jeder Beziehung
Ankuendigungs- und Vollzugsdatum. Er ist am 2026-09-07 quellengeprueft worden.
Das ist belastbarer als ein Websuchindex, aus dem der Grundstock stammt.

**ALTERNATIVES:** Eigene Werte behalten und v004 nur ergaenzend fuehren — dann
haette der Bestand zwei Wahrheiten ueber dasselbe Datum. Beide Werte in
getrennten Feldern fuehren — Aufwand ohne Nutzen, solange niemand die Historie
auswertet.

**TRADEOFFS:** Zwei Ankuendigungsdaten haben sich geaendert (Uber/Delivery Hero
2026-05-23 → 2026-07-16, Frasers/Hugo Boss 2026-06-10 → 2026-09-01). Moeglich,
dass beide Werte stimmen und nur verschiedene Ereignisse meinen — die
Anmerkung haelt das fest, statt den frueheren Wert zu loeschen.

**REVERSIBLE:** YES — der fruehere Wert steht in der Anmerkung.

## 21 — Kaufabsicht ist ein eigener Dealstatus

**DECISION:** `DEAL_STATUSES` fuehrt `intent` ("Kaufabsicht") zwischen
`sale_process` und `announced`, und der Wert zaehlt zu
`UNCONFIRMED_DEAL_STATUSES`.

**WHY:** v004 trennt `completed`, `pending` und `interest` und zeichnet die
Kaufabsicht auf der Karte eigens aus. Der Zustand ist wirklich ein eigener: der
Kaeufer hat die Absicht belegt erklaert, ein Angebot liegt aber nicht vor. Ihn
auf `announced` abzubilden haette behauptet, es sei etwas angeboten worden;
`rumored` haette eine Emittentenmitteilung zum Geruecht gemacht. Regel 2 des
Projekts verlangt, dass Unbestaetigtes unterscheidbar bleibt.

**ALTERNATIVES:** Auf `announced` oder `rumored` abbilden — beides sagt etwas
Falsches. Ein eigenes Feld neben dem Status — mehr Struktur fuer einen
Zustand, der in dieselbe Achse gehoert.

**TRADEOFFS:** Ein achter Status in Filtern und Legende.

**REVERSIBLE:** YES.

## 22 — Jede Koordinate traegt ihre Quelle im Datensatz

**DECISION:** `Company` hat `coordinate_source_url`. Das Schema weist eine
Koordinate ohne Quelle zurueck.

**WHY:** Regel 14 stand bisher nur in der Dokumentation und im Importer — die
Herkunft wurde im Lookup gefuehrt und beim Schreiben weggeworfen. Solange alle
Koordinaten aus einer Datei kamen, fiel das nicht auf. Mit v004 kommen sie aus
drei Quellen mit verschiedener Genauigkeit; wer den Bestand liest, muss je
Datensatz sehen koennen, worauf die Koordinate beruht.

**ALTERNATIVES:** Herkunft nur ueber `source_ids` des Unternehmens fuehren —
das sagt, welche Quellen es zum Unternehmen gibt, nicht welche die Koordinate
belegt.

**TRADEOFFS:** Ein Pflichtfeld mehr. Es hat sofort einen Fehler gefunden: die
von v004 ergaenzten Emittenten tragen einen Ortsnamen ohne Wikidata-ID, woraus
ein Link auf `.../wiki/undefined` entstand.

**REVERSIBLE:** YES.
