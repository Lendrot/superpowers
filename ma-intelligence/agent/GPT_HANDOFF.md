# Uebergabe an GPT — was geliefert werden soll

GPT recherchiert, Claude baut. Diese Datei beschreibt, wie ein
Rechercheergebnis aussehen muss, damit die Import-Pipeline es verarbeiten kann.

> **Stand: Entwurf.** Das Format ist festgelegt, die Pipeline, die es einliest,
> wird in Schritt 3 gebaut. Lieferungen koennen ab sofort im Zielformat
> abgelegt werden; verarbeitet werden sie, sobald der Importer steht.

## Ablageort

Eine Lieferung ist **eine JSON-Datei** unter
`data/intelligence/incoming/<jahr-monat>-<thema>.json`, zum Beispiel
`2025-11-deutschland-ma.json`. Nichts wird direkt in `verified/` geschrieben.

## Grundregeln

1. **Nichts erfinden.** Unbekannte Werte sind `null`. Nicht schaetzen.
2. **Jede Aussage braucht eine Quelle.** Jeder Datensatz nennt in `source_refs`,
   worauf er sich stuetzt.
3. **Im Zweifel die niedrigere Statusstufe.** "Kreise sagen" ist `rumored`,
   "prueft den Verkauf" ist `sale_process`, nicht `announced`.
4. **Firmennamen so schreiben wie die Quelle.** Die Normalisierung macht die
   Pipeline; abgeschliffene Namen kosten nur Information.
5. **Datumsangaben als `YYYY-MM-DD`.**
6. **Keine IDs vergeben.** Innerhalb der Datei wird mit frei gewaehlten
   `ref`-Schluesseln aufeinander verwiesen; die endgueltigen IDs vergibt die
   Pipeline, damit dasselbe Unternehmen nicht zweimal entsteht.

## Format

```json
{
  "dataset_id": "2025-11-deutschland-ma",
  "prepared_at": "2025-12-01T09:00:00.000Z",
  "scope": "Deutschland, angekuendigte und vollzogene Deals November 2025",

  "sources": [
    {
      "ref": "s1",
      "url": "https://…",
      "publisher": "Name des Mediums oder der Institution",
      "title": "Titel der Meldung",
      "publication_date": "2025-11-04",
      "source_type": "news_article",
      "language": "de"
    }
  ],

  "companies": [
    {
      "ref": "c1",
      "legal_name": "Musterwerke GmbH",
      "display_name": "Musterwerke",
      "former_names": [],
      "aliases": [],
      "entity_type": "company",
      "country": "DE",
      "headquarters": { "city": "Beispielheim", "region": "Hessen", "street_address": null, "postal_code": null },
      "latitude": null,
      "longitude": null,
      "industry": "industrial_manufacturing",
      "subindustry": null,
      "website": null,
      "status": "active",
      "identifiers": { "lei": null, "handelsregister": null, "vat_id": null, "isin": null, "wikidata": null, "domains": [] },
      "source_refs": ["s1"]
    }
  ],

  "deals": [
    {
      "ref": "d1",
      "target_ref": "c1",
      "buyer_ref": "c2",
      "seller_ref": null,
      "seller_name": null,
      "deal_type": "acquisition",
      "status": "announced",
      "announcement_date": "2025-11-04",
      "completion_date": null,
      "deal_value": 120000000,
      "currency": "EUR",
      "ownership_percentage": 100,
      "source_refs": ["s1"],
      "notes": null
    }
  ],

  "ownerships": [],
  "assets": [],
  "events": []
}
```

## Erlaubte Werte

Die kontrollierten Listen stehen in `../src/domain/vocabulary.ts` und sind in
`../docs/data-schema.md` erklaert. Ein Wert ausserhalb der Liste fuehrt zur
Ablehnung des Datensatzes — lieber `other` oder `unknown` als ein erfundener Wert.

- `status` (Deal): `rumored`, `sale_process`, `announced`, `signed`,
  `regulatory_review`, `completed`, `cancelled`
- `deal_type`: `acquisition`, `majority_stake`, `minority_stake`, `merger`,
  `asset_deal`, `carve_out`, `joint_venture`, `management_buyout`,
  `insolvency_sale`, `unknown`
- `entity_type`: `company`, `person`, `family_office`, `foundation`, `fund`,
  `government`, `unknown`
- `source_type`: `regulatory_filing`, `court_register`, `company_primary`,
  `press_release`, `news_article`, `database`, `analyst_report`,
  `industry_report`, `other`
- `industry`: siehe `INDUSTRIES` in `../src/domain/vocabulary.ts`

## Was besonders hilft

- **Kennungen.** LEI, ISIN oder Handelsregisternummer machen aus einem
  unsicheren Namenstreffer einen sicheren.
- **Website-Domain.** Zweitstaerkstes Identitaetssignal nach den Kennungen.
- **Frueherer Firmenname.** Umfirmierungen sind die haeufigste Ursache
  scheinbarer Dubletten.
- **Widerspruechliche Angaben nennen, nicht aufloesen.** Wenn zwei Quellen
  verschiedene Kaufpreise nennen, gehoert das in `notes` — die Entscheidung
  faellt in der Review Queue, nicht in der Recherche.
