# Regeln fuer Daten und Recherche

Diese Regeln gelten fuer alles, was in `data/intelligence/verified/` landet —
egal ob es von GPT, aus einem News-Feed oder von Hand kommt.

## 1. Nichts erfinden

Fehlt ein Wert, ist er `null`. Nicht schaetzen, nicht "ungefaehr", nicht aus
einem aehnlichen Fall uebertragen. Ein geschaetzter Transaktionswert ohne
Kennzeichnung ist eine Falschaussage.

## 2. Geruecht ist nicht Vollzug

Der Dealstatus ist die zentrale Unterscheidung des Systems:

- `rumored` und `sale_process` sind **unbestaetigt**.
- Sie duerfen nie wie bestaetigte Deals dargestellt werden — nicht in derselben
  Farbe, nicht mit demselben Symbol, nicht ohne Kennzeichnung.
- Eine Meldung "X prueft den Verkauf von Y" ist `sale_process`, nicht
  `announced`. "Kreise sagen" ist `rumored`.
- Ein Statuswechsel nach oben braucht eine neue Quelle. Ein Geruecht wird nicht
  dadurch zum Vollzug, dass es aelter wird.

## 3. Jede Aussage braucht eine Quelle

Ein Datensatz ohne `source_ids` ist unbelegt und erreicht die Produktionsdaten
nicht. Mehrere Quellen desselben Verlags oder Meldungen, die erkennbar dieselbe
Agenturmeldung wiedergeben, zaehlen als **eine** Bestaetigung.

## 4. Belegstatus trennen

| Status | Wann |
| --- | --- |
| `FACT` | Direkt aus einer Quelle belegt. |
| `INFERENCE` | Aus Belegtem gefolgert (z. B. Beteiligung aus vollzogenem Deal). |
| `ASSUMPTION` | Plausibel, aber unbelegt. |
| `UNKNOWN` | Offen. |

Die Produktionsdatenbank soll `FACT` enthalten. `INFERENCE` ist zulaessig, wenn
die Herleitung in `notes` steht. `ASSUMPTION` wird nicht veroeffentlicht.

## 5. Identitaet vor Neuanlage

Vor jedem neuen Unternehmen wird gegen den Bestand geprueft: normalisierter
Name, Domain, LEI, ISIN, Handelsregister. "BASF SE", "BASF" und "BASF Group"
sind ein Unternehmen. Ein unsicherer Treffer geht in die Review Queue — er wird
weder automatisch zusammengefuehrt noch automatisch neu angelegt.

## 6. Widerspruch schlaegt Ueberschreiben

Widerspricht eine neue Angabe dem Bestand (anderer Kaeufer, anderer Wert,
anderer Status), wird der Bestand nicht ueberschrieben. Der Fall geht in die
Review Queue, mit beiden Quellen.

## 7. Was GPT liefern sollte

Ein Importdatensatz ist am nuetzlichsten, wenn er:

- pro Aussage die Quelle nennt, aus der sie stammt,
- Datumsangaben als `YYYY-MM-DD` liefert,
- unbekannte Felder ausdruecklich `null` setzt statt sie wegzulassen,
- Firmennamen so schreibt, wie die Quelle sie schreibt (Normalisierung macht
  die Pipeline),
- den Dealstatus konservativ waehlt: im Zweifel die niedrigere Stufe.

Das Format steht in `../agent/GPT_HANDOFF.md`.
