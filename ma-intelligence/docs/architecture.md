# Architektur

## Was das System ist

Ein Intelligence-System ueber Unternehmen, Uebernahmen, Eigentuemerstrukturen,
Produktionsstandorte und Rohstoffe. Die Karte ist eine Sicht darauf, nicht sein
Zweck. Jede Entscheidung hier folgt daraus: das Datenmodell ist ein Graph mit
Koordinaten als Attribut, keine Sammlung von Kartenpunkten mit Zusatzinfo.

## Schichten

```
                    ┌───────────────────────────────┐
   GPT-Recherche →  │  data/intelligence/incoming/  │  JSON, unvalidiert
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │            ingest/            │
                    │  Schema → Entity Matching →   │
                    │  Dubletten → Quellen →        │
                    │  Confidence → Review Queue    │
                    └───────┬───────────────┬───────┘
                            │               │
              geprueft      │               │  unsicher / abgelehnt
                            ▼               ▼
              data/intelligence/verified/   .../rejected/  + Review Queue
                            │
                    ┌───────▼───────┐        ┌──────────────┐
                    │    store/     │───────▶│  Export-     │──▶ web/ (Karte)
                    │  JSON-Bestand │        │  Bundle      │
                    └───────────────┘        └──────────────┘
```

`domain/` liegt unter allem: Typen, Schemas, IDs, Namensnormalisierung,
Confidence. Es importiert nichts aus den anderen Schichten, liest keine Dateien
und kennt kein Netzwerk. Erzwungen in `eslint.config.js`, nicht nur verabredet.

## Warum diese Trennung

Der teuerste Fehler in einem solchen System ist nicht ein Absturz, sondern ein
falscher Datensatz, der unbemerkt in die Datenbank kommt. Deshalb liegt zwischen
"jemand hat etwas recherchiert" und "steht in der Datenbank" eine Schicht, die
nur prueft und entscheidet, und die technisch gar nicht schreiben kann: `ingest/`
darf `node:fs` und `store/` nicht importieren.

## Datenfluss beim Import

1. **Schema-Validierung.** Zod prueft die Form. Ein Datensatz, der die Form
   verletzt, wird nicht repariert, sondern abgelehnt — mit Begruendung.
2. **Quellenpruefung.** Jede inhaltliche Aussage braucht mindestens eine Quelle;
   Quellen werden auf Form und Typ geprueft.
3. **Entity Matching.** Normalisierter Name, Domain und Kennungen (LEI, ISIN,
   Handelsregister) werden gegen den Bestand gehalten. Ein sicherer Treffer
   fuehrt zusammen, ein unsicherer geht in die Review Queue.
4. **Dublettenerkennung.** Ein Deal ist eine Dublette, wenn Ziel, Kaeufer und
   Zeitraum uebereinstimmen — auch wenn er anders geschrieben ist.
5. **Confidence.** Aus Quellenzahl, Quellentyp und Dealstatus.
6. **Review Queue.** Alles unter der Schwelle, jeder unsichere Match, jeder
   Widerspruch zum Bestand. Nichts davon erreicht die Datenbank ohne Freigabe.

## Persistenz

Phase 1 speichert die Datenbank als JSON-Dateien in Git (`decisions.md` #2).
Das hat einen Vorteil, den keine Datenbank bietet: **jede Datenaenderung ist ein
Diff und damit pruefbar**. Wer einen Deal von `announced` auf `completed` setzt,
hinterlaesst eine Zeile, die jemand lesen kann.

Wann das nicht mehr traegt und was dann kommt, steht in `decisions.md`.

## Karte

Die Karte ist ein statisches Frontend ueber einem exportierten Bundle. Sie hat
keinen eigenen Zustand und keine eigene Wahrheit; sie kann nichts anzeigen, was
nicht vorher durch die Pipeline gegangen ist. Die Darstellungsregeln —
insbesondere die Trennung von Geruecht und Vollzug — stehen in
`research-rules.md`.

## Vorbereitet, aber nicht gebaut

Die folgenden Dinge haben im Modell bereits ihren Platz, damit sie spaeter ohne
Umbau dazukommen. Gebaut sind sie nicht, und es gibt keine leeren Platzhalter
dafuer im Code:

- **Europa.** `country` ist ISO 3166-1 an jeder Entitaet; Phase 1 filtert auf
  `DE`, statt das Modell auf Deutschland zu verengen.
- **Assets, Minen, Rohstoffe.** Schemas existieren und sind getestet; befuellt
  werden sie in einer spaeteren Phase.
- **News-Automatisierung.** `Event` und `Source` sind die Andockstelle. Ein
  Feed-Reader wuerde Events erzeugen und dieselbe Pipeline durchlaufen wie ein
  GPT-Datensatz — es gibt keinen zweiten Weg in die Datenbank.
- **Zeitliche Gueltigkeit.** `Ownership` hat `valid_from`/`valid_to`, damit
  Eigentuemerstrukturen historisch abfragbar bleiben.
