# Bestandsaufnahme: Marktatlas v003 (Ausgangsstand 2026-09-06)

Die gelieferte Website ist ab sofort die **Ausgangsbasis** des Projekts, nicht
eine Referenz. Sie liegt unveraendert unter `../site/`. Diese Datei haelt fest,
was sie ist, was davon traegt und was sich dadurch an Architektur und Plan
aendert.

## 1. Verzeichnisstruktur

```
site/
  .openai/hosting.json    statisches Hosting, ausgeliefert wird dist/
  README.md               Datengrenzen und Validierungsregeln des Autors
  data/
    companies.sparql            die Wikidata-Abfrage hinter dem Snapshot
    world-acquisitions.json     kuratierte Deals, Eingabe des Build-Skripts
    acquisition-locations-raw.json  rohe SPARQL-Antwort fuer Zusatzstandorte
  dist/                   die ausgelieferte Website
    index.html                  3D-Globus
    karte/index.html            2D-Karte
    assets/                     Daten, Vendor-Bibliotheken, Fonts, Lizenzen
  scripts/
    fetch-data.py               SPARQL → companies.json, holt auch Vendor-Assets
    build-acquisitions.py       kuratierte Deals → acquisitions.json
    check-navigation.mjs        Kameramathematik des Globus
```

## 2. HTML / CSS / JavaScript

Zwei schlanke HTML-Seiten (je unter 1,1 kB), die nur ein `<main id="app">`
aufspannen; die gesamte Oberflaeche wird in JavaScript per `innerHTML` erzeugt.

| Datei | Groesse | Rolle |
| --- | --- | --- |
| `dist/assets/app.js` | 20 kB | 2D-Karte: Aufbau, Cluster, Detailpanel, Dialoge |
| `dist/assets/map-logic.mjs` | 1 kB | reine Hilfsfunktionen, ohne DOM |
| `dist/assets/globe-app.js` | ~ | Globus: Deals als Boegen, Regionsfilter |
| `dist/assets/globe-scene.js`, `globe-navigation.js`, `globe-math.mjs` | ~ | Three.js-Szene, Kamerasteuerung, Mathematik |
| `dist/assets/app.css`, `globe.css` | 19 kB / — | vollstaendiges Design, deutschsprachig |

Auffaellig: `app.js` und `app.css` enthalten Zeilen mit ueber 2.500 bzw. 14.000
Zeichen. Der Code ist funktionsfaehig und sorgfaeltig, aber in dieser Form
schwer zu reviewen und nicht testbar — mit Ausnahme von `map-logic.mjs`, das
bewusst rein gehalten ist.

## 3. Vorhandene Daten

| Datei | Inhalt |
| --- | --- |
| `companies.json` | **9.868 boersennotierte Unternehmen** aus Wikidata (CC0), Stand 2026-09-05, mit Koordinaten, Genauigkeitsangabe, Ort, Land, Boersennotierungen. Davon **138 mit Sitz in Deutschland**. |
| `acquisitions.json` | **22 vollzogene Uebernahmen 2026** mit Primaerquelle je Deal, dazu 42 Entities mit Koordinaten. Genau **eine mit deutschem Bezug**: Holcim → Xella (Duisburg), vollzogen 2026-06-19. |
| `world.json` | Natural-Earth-Laendergeometrie als TopoJSON (740 kB) |

Die Daten sind ehrlich abgegrenzt: `complete: false`,
`tradingIn2026Verified: false`, und der README benennt die Grenzen ausdruecklich.
Das passt zur Haltung dieses Projekts und wird uebernommen.

## 4. Kartenimplementierung

- **2D** (`/karte/`): Leaflet 1.9.4 mit MarkerCluster 1.5.3. Die bundeseigene
  Laendergeometrie wird aus `world.json` gezeichnet; CARTO-/OSM-Kacheln sind
  eine **optionale** Verbesserung, die Karte funktioniert ohne sie.
- **3D** (`/`): Three.js 0.179.1, NASA-Erdmodell (13 MB `.glb`), Uebernahmen als
  gerichtete Boegen vom Kaeufer zum Ziel, mit Fallback auf die 2D-Karte, wenn
  WebGL fehlt.

Beides laedt **ausschliesslich lokale Assets**. Kein CDN, kein API-Aufruf zur
Laufzeit, keine Schluessel. Das ist eine Qualitaet, die erhalten bleibt.

## 5. Marker, Kategorien, Filter

- **Marker**: ein Punkt je Unternehmen, Groesse zoomabhaengig
  (`pinSize`, `clusterSize`, `clusterRadius` in `map-logic.mjs`), Cluster mit
  Aufsplittung, Spiderfy bei Standortgleichheit.
- **Kategorien**: es gibt **keine** Branchenkategorien. Unterschieden wird nur
  Unternehmen vs. Uebernahme, und beim Deal `kind: company | majority | business`.
- **Filter**: die 2D-Karte hat **keine Filter**. Der Globus hat genau einen:
  Region (sechs Kontinente), der auf beide Deal-Enden passt.

Das ist die groesste Luecke zur Definition of Done: Status-, Branchen- und
Zeitraumfilter existieren heute nicht, und die Daten tragen sie auch nicht.

## 6. Externe Bibliotheken und APIs

| Bibliothek | Version | Einbindung |
| --- | --- | --- |
| Leaflet | 1.9.4 | lokal gebuendelt, Lizenz beigelegt |
| Leaflet.markercluster | 1.5.3 | lokal gebuendelt |
| topojson-client | — | lokal gebuendelt |
| Three.js | 0.179.1 | lokal gebuendelt, per Importmap |
| DM Sans | — | lokal als woff2 |

Zur Laufzeit wird **nichts** nachgeladen ausser optionalen Kartenkacheln.
Datenbeschaffung passiert offline in Python (`fetch-data.py` gegen den
Wikidata-Query-Service).

## 7. Wiederverwendbare Bestandteile

1. **Die 138 deutschen Unternehmen mit echten Koordinaten und Wikidata-IDs.**
   Das ist genau das, was die Deutschland-V1 als "reale Targets" braucht — und
   die Wikidata-ID ist ein belastbarer Identifikator fuer die Entity Resolution.
2. **Der gebuendelte Leaflet-Stack plus `world.json`.** Damit braucht die
   Deutschlandkarte weder CDN noch Kachelserver. Meine offene Frage nach der
   Kartenbibliothek ist damit beantwortet.
3. **`map-logic.mjs`** — reine, testbare Hilfsfunktionen.
4. **Die Standort-Provenienz** (`accuracy`, `locationSourceUrl`,
   `coordinateSourceUrl`): der Autor trennt Standortbeleg und Transaktionsbeleg.
   Das ist besser als mein bisheriges Modell und wurde uebernommen.
5. **`companies.sparql`** als dokumentierter, wiederholbarer Beschaffungsweg.
6. **Das Design** (`app.css`) und die deutschsprachige Oberflaeche.

## 8. Technische Probleme

| Befund | Bedeutung |
| --- | --- |
| Keine Filter auf der 2D-Karte | Kernluecke zur DoD |
| Keine Branchenklassifikation in den Daten | Branchenfilter nicht befuellbar; die SPARQL-Abfrage holt P452 nicht |
| Nur Status `completed` | Geruecht/Verkaufsprozess/angekuendigt fehlen vollstaendig — die Kernunterscheidung dieses Projekts ist in den Daten nicht abbildbar |
| Keine Verkaeuferangaben | Deals sind `buyer → target`, mehr nicht |
| Zwei getrennte Datenmodelle | `companies.json` und `acquisitions.json` werden ueber `existingCompanyId` und freie Schluessel (`'wiz'`, `'armis'`) verbunden; IDs sind nicht quellenuebergreifend stabil |
| Keine Schemavalidierung | Die JSON-Dateien entstehen aus Python-Skripten mit `assert` |
| Laender als deutsche Anzeigenamen | `"Deutschland"` statt ISO-3166 — Filter und Joins brauchen den Code |
| `app.js` als ein grosser innerHTML-Block | schwer zu aendern, nicht testbar |
| 13 MB Erdmodell im Repository | einmalige Last, fuer Phase 1 ohne Belang |
| Keine Browsertests | vom Autor ausdruecklich vermerkt |

## 9. Abgleich mit dem entwickelten Datenmodell

| Anforderung der Website | Mein Modell | Konsequenz |
| --- | --- | --- |
| Koordinatengenauigkeit je Standort | fehlte | **`coordinate_accuracy` ergaenzt** |
| Quelle fuer Koordinate ≠ Quelle fuer Deal | fehlte als Feinstruktur | **`Claim` deckt das ab** (Feld `latitude`, eigene Quelle) |
| Deal mit `kind: company/majority/business` | `deal_type` + `transaction_structure` | Abbildung im Importer, kein Modellbedarf |
| Wikidata-ID als Identitaet | `identifiers.wikidata` vorhanden | passt unveraendert |
| Nur vollzogene Deals | sieben Status | Website ist Teilmenge, Modell traegt mehr |
| Kein Verkaeufer | `sellers: []` heisst unbekannt | passt unveraendert |
| Land als Anzeigename | ISO-3166 alpha-2 | Umschluesselung im Importer |

Das Modell haelt der echten Website stand. Geaendert wurde genau eine Sache
(`coordinate_accuracy`); alles Uebrige liess sich abbilden.

## 10. Angepasste Architektur und Migrationsplan

Die Website bleibt, wie sie ist, und wird **erweitert statt ersetzt**:

```
site/dist/                  bestehende Auslieferung, unveraendert
site/dist/deutschland/      NEU: die Deutschland-M&A-Ansicht
site/dist/assets/           bestehende Vendor-Bibliotheken werden mitbenutzt
site/dist/assets/deutschland-ma.json   NEU: erzeugt aus der geprueften Datenbank

ma-intelligence/src/ingest/marktatlas.ts   liest companies.json/acquisitions.json
ma-intelligence/src/store/                 laedt und schreibt die gepruefte Datenbank
ma-intelligence/src/cli/build-map.ts       Datenbank → Kartendaten
```

Reihenfolge:

1. Schemakorrekturen aus dem Red-Team-Auftrag — **erledigt**.
2. Store mit referentieller Integritaetspruefung.
3. Importer, der den deutschen Teil des Marktatlas in das Modell uebersetzt.
4. Recherchierter deutscher Datensatz mit den geforderten Fallunterscheidungen.
5. Deutschlandkarte als neue Seite in der bestehenden Website, mit Marker,
   Detailansicht, Quellenlink und den drei Filtern.

Was **nicht** passiert: kein Neubau der Website, keine Aenderung am Globus, kein
Umschreiben von `app.js`, keine neue Kartenbibliothek, keine Europa- oder
Rohstofferweiterung.
