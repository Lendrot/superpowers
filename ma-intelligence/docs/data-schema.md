# Datenmodell

Die verbindliche Fassung sind die Zod-Schemas in `../src/domain/entities.ts`.
Dieses Dokument erklaert sie; bei Abweichung gilt der Code.

## Konventionen

- **Feldnamen sind `snake_case`** — dieselbe Schreibweise in JSON-Dateien, in
  GPT-Lieferungen und im TypeScript-Modell. Es gibt keine Uebersetzungsschicht.
- **Unbekanntes ist `null`, nicht weggelassen.** Jedes Feld ist Pflicht. Ein
  fehlender Schluessel wird abgelehnt, ein `null` ist die Aussage "nicht bekannt".
- **Unbekannte Felder werden abgelehnt** (`.strict()`). Ein Feld, das das Modell
  nicht kennt, waere sonst stillschweigend verloren.
- **IDs sind lesbar und inhaltsabgeleitet** (`company_basf_se`), damit ein
  Git-Diff verstaendlich bleibt. Eine ID aendert sich nie nachtraeglich.

## Belegspur

Company, Deal, Ownership, Asset und Event tragen dieselben fuenf Felder:

| Feld | Bedeutung |
| --- | --- |
| `source_ids` | Belege. Darf leer sein, dann ist der Datensatz sichtbar quellenlos. |
| `confidence` | 0–100, siehe unten. |
| `evidence` | `FACT` \| `INFERENCE` \| `ASSUMPTION` \| `UNKNOWN`. |
| `created_at`, `updated_at` | UTC-Zeitstempel. |

`Commodity` und `Source` tragen sie nicht: ein Rohstoff ist eine Vokabelliste,
eine Quelle ist selbst der Beleg.

## Entitaeten

### Company — jeder Akteur

Unternehmen, Personen, Familienbueros, Stiftungen, Fonds und Staaten sind
derselbe Knotentyp, unterschieden ueber `entity_type`. Grund: "Bundesrepublik
Deutschland haelt 20 % an X" ist dieselbe Beziehung wie "Konzern haelt 20 % an
X", und ein zweiter Knotentyp wuerde jede Graphabfrage verdoppeln.

Wesentliche Felder: `legal_name` (Registerfirmierung) und `display_name`
(Oberflaeche), `former_names` und `aliases` (Futter fuer die Entity Resolution),
`country`, `headquarters`, `latitude`/`longitude` (beide oder keiner),
`industry` aus kontrolliertem Vokabular plus freies `subindustry`, `status`,
`identifiers` (LEI, Handelsregister, USt-IdNr., ISIN, Wikidata, Domains).

### Deal — die Transaktion

`status` ist das wichtigste Feld des Systems und kennt genau sieben Werte:

| Status | Bedeutung |
| --- | --- |
| `rumored` | Geruecht. Nichts ist bestaetigt. |
| `sale_process` | Verkaufsprozess laeuft, Kaeufer offen. |
| `announced` | Oeffentlich angekuendigt. |
| `signed` | Vertrag unterzeichnet. |
| `regulatory_review` | Kartellrechtliche Pruefung laeuft. |
| `completed` | Vollzogen. |
| `cancelled` | Abgebrochen. |

`rumored` und `sale_process` sind **unbestaetigt** und muessen ueberall optisch
getrennt bleiben (`research-rules.md`).

Erzwungene Regeln: ein Wert ohne Waehrung wird abgelehnt; ein Vollzugsdatum vor
dem Ankuendigungsdatum wird abgelehnt; ein Unternehmen kann sich nicht selbst
uebernehmen. Ein noch unbekannter Kaeufer ist `null` — nie geraten.

### Ownership — die Beteiligung

Gerichtete Kante zwischen zwei Akteuren mit `ownership_percentage`,
`relationship_type` (u. a. `parent`, `shareholder`, `private_equity_owner`,
`government_owner`) und Gueltigkeitszeitraum. `valid_to: null` heisst "gilt
weiterhin", nicht "Ende unbekannt".

### Asset — der Standort

Mine, Lagerstaette, Raffinerie, Huette, Verarbeitung, Recycling, Fabrik, Lager,
Hafenterminal. Getrennte Felder fuer `operator_id` und `owner_id`, weil Betreiber
und Eigentuemer regelmaessig auseinanderfallen. `commodity_ids` verbindet den
Standort mit dem, was dort gefoerdert oder verarbeitet wird.

### Commodity — der Rohstoff

Kontrollierte Liste mit deutschem und englischem Namen, Elementsymbol,
Kategorie (Basismetall, Edelmetall, Batteriemetall, Seltene Erden, kritischer
Rohstoff, Industriemineral, Energie) und einem Flag fuer die EU-Liste
kritischer Rohstoffe.

### Source — der Beleg

`url` (oder `null` bei Papierquellen), `publisher`, `title`,
`publication_date`, `accessed_at`, `source_type`, `reliability_score`,
`language`, `archive_url`. Der `source_type` bestimmt den Ausgangswert der
Zuverlaessigkeit; `reliability_score` erlaubt, eine einzelne Quelle davon
abweichend zu bewerten.

### Event — die Meldung

Ereignis mit Datum, Schlagzeile und Verweisen auf Unternehmen, Assets und Deals.
Die Andockstelle fuer die spaetere News-Automatisierung.

## Beziehungen

```
Company  --owns-->        Company     (Ownership)
Company  --acquires-->    Company     (Deal)
Company  --operates-->    Asset       (Asset.operator_id)
Company  --owns-->        Asset       (Asset.owner_id)
Asset    --produces-->    Commodity   (Asset.commodity_ids)
Deal     --affects-->     Company     (Deal.target/buyer/seller)
Event    --concerns-->    Company | Asset | Deal
*        --evidenced_by-> Source      (source_ids)
```

Der Graph laesst sich aus dem Bestand ableiten; er wird nicht getrennt
gespeichert, solange die Datenmenge in den Speicher passt.

## Confidence

| Bereich | Bedeutung |
| --- | --- |
| 90–100 | Primaerquelle (Register, Pflichtmitteilung) oder mehrere hochwertige, unabhaengige Bestaetigungen. |
| 70–89 | Mehrere serioese Sekundaerquellen. |
| 50–69 | Plausibel, aber eingeschraenkt bestaetigt. |
| unter 50 | Wird nicht automatisch veroeffentlicht. |

Die Berechnung folgt in Schritt 2 (`src/domain/confidence.ts`). Bis dahin ist
`confidence` ein Feld, das die Pipeline noch nicht selbst setzt.
