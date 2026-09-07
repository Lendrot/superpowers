import { describe, expect, it } from 'vitest';

import {
  assetSchema,
  companySchema,
  dealSchema,
  intelligenceDatabaseSchema,
  ownershipSchema,
  sourceSchema,
} from '@/domain/entities.js';
import {
  exampleAsset,
  exampleBuyer,
  exampleCommodity,
  exampleDeal,
  exampleOwnership,
  exampleSource,
  exampleTarget,
} from '../fixtures/records.js';

describe('companySchema', () => {
  it('nimmt einen vollstaendigen Datensatz an', () => {
    expect(companySchema.parse(exampleBuyer)).toEqual(exampleBuyer);
  });

  it('verlangt null statt weggelassener Felder', () => {
    const { website: _website, ...withoutWebsite } = exampleBuyer;
    expect(companySchema.safeParse(withoutWebsite).success).toBe(false);
    expect(companySchema.safeParse({ ...exampleBuyer, website: null }).success).toBe(true);
  });

  it('weist unbekannte Felder ab, statt sie stillschweigend zu verschlucken', () => {
    const result = companySchema.safeParse({ ...exampleBuyer, revenue_2024: 1_000_000 });
    expect(result.success).toBe(false);
  });

  it('laesst keine halbe Koordinate zu', () => {
    expect(companySchema.safeParse({ ...exampleBuyer, latitude: null }).success).toBe(false);
    expect(companySchema.safeParse({ ...exampleBuyer, latitude: null, longitude: null }).success).toBe(true);
  });

  it('prueft Branche und Status gegen das Vokabular', () => {
    expect(companySchema.safeParse({ ...exampleBuyer, industry: 'Chemie' }).success).toBe(false);
    expect(companySchema.safeParse({ ...exampleBuyer, status: 'verkauft' }).success).toBe(false);
  });

  it('prueft die Form von Kennungen', () => {
    const identifiers = { ...exampleBuyer.identifiers, isin: 'DE000BASF11' };
    expect(companySchema.safeParse({ ...exampleBuyer, identifiers }).success).toBe(false);
    const valid = { ...exampleBuyer.identifiers, isin: 'DE000BASF111' };
    expect(companySchema.safeParse({ ...exampleBuyer, identifiers: valid }).success).toBe(true);
  });
});

describe('dealSchema', () => {
  it('nimmt einen vollstaendigen Datensatz an', () => {
    expect(dealSchema.parse(exampleDeal)).toEqual(exampleDeal);
  });

  it('kennt genau die sieben Statuswerte', () => {
    for (const status of [
      'rumored',
      'sale_process',
      'announced',
      'signed',
      'regulatory_review',
      'completed',
      'cancelled',
    ]) {
      expect(dealSchema.safeParse({ ...exampleDeal, status }).success).toBe(true);
    }
    expect(dealSchema.safeParse({ ...exampleDeal, status: 'geruecht' }).success).toBe(false);
    expect(dealSchema.safeParse({ ...exampleDeal, status: 'pending' }).success).toBe(false);
  });

  it('laesst einen offenen Kaeufer zu, aber keinen Selbstkauf', () => {
    expect(dealSchema.safeParse({ ...exampleDeal, buyer_company_id: null }).success).toBe(true);
    expect(
      dealSchema.safeParse({ ...exampleDeal, buyer_company_id: exampleDeal.target_company_id }).success,
    ).toBe(false);
  });

  it('verlangt zu einem Wert eine Waehrung', () => {
    expect(dealSchema.safeParse({ ...exampleDeal, currency: null }).success).toBe(false);
    expect(dealSchema.safeParse({ ...exampleDeal, deal_value: null, currency: null }).success).toBe(true);
  });

  it('laesst den Vollzug nicht vor der Ankuendigung liegen', () => {
    expect(dealSchema.safeParse({ ...exampleDeal, completion_date: '2025-11-03' }).success).toBe(false);
    expect(dealSchema.safeParse({ ...exampleDeal, completion_date: '2026-02-01' }).success).toBe(true);
  });

  it('prueft Datumsangaben auf Existenz', () => {
    expect(dealSchema.safeParse({ ...exampleDeal, announcement_date: '2025-02-30' }).success).toBe(false);
    expect(dealSchema.safeParse({ ...exampleDeal, announcement_date: '04.11.2025' }).success).toBe(false);
  });
});

describe('ownershipSchema', () => {
  it('nimmt einen vollstaendigen Datensatz an', () => {
    expect(ownershipSchema.parse(exampleOwnership)).toEqual(exampleOwnership);
  });

  it('verbietet Selbstbeteiligung und rueckwaerts laufende Zeitraeume', () => {
    expect(
      ownershipSchema.safeParse({ ...exampleOwnership, owned_id: exampleOwnership.owner_id }).success,
    ).toBe(false);
    expect(ownershipSchema.safeParse({ ...exampleOwnership, valid_to: '2019-01-01' }).success).toBe(false);
  });

  it('begrenzt Anteile auf 0 bis 100 Prozent', () => {
    expect(ownershipSchema.safeParse({ ...exampleOwnership, ownership_percentage: 100.1 }).success).toBe(false);
    expect(ownershipSchema.safeParse({ ...exampleOwnership, ownership_percentage: null }).success).toBe(true);
  });
});

describe('assetSchema und sourceSchema', () => {
  it('nehmen vollstaendige Datensaetze an', () => {
    expect(assetSchema.parse(exampleAsset)).toEqual(exampleAsset);
    expect(sourceSchema.parse(exampleSource)).toEqual(exampleSource);
  });

  it('erlauben einer Quelle nur dann keine URL, wenn sie ausdruecklich null ist', () => {
    expect(sourceSchema.safeParse({ ...exampleSource, url: null }).success).toBe(true);
    expect(sourceSchema.safeParse({ ...exampleSource, url: 'example.org' }).success).toBe(false);
  });

  it('binden ein Asset an sein Vokabular', () => {
    expect(assetSchema.safeParse({ ...exampleAsset, asset_type: 'Huette' }).success).toBe(false);
    expect(assetSchema.safeParse({ ...exampleAsset, operational_status: 'laeuft' }).success).toBe(false);
  });
});

describe('intelligenceDatabaseSchema', () => {
  it('validiert den Gesamtbestand', () => {
    const database = {
      companies: [exampleBuyer, exampleTarget],
      deals: [exampleDeal],
      ownerships: [exampleOwnership],
      assets: [exampleAsset],
      commodities: [exampleCommodity],
      sources: [exampleSource],
      events: [],
    };
    expect(intelligenceDatabaseSchema.parse(database)).toEqual(database);
  });

  it('verlangt jede Sammlung, auch wenn sie leer ist', () => {
    expect(intelligenceDatabaseSchema.safeParse({ companies: [], deals: [] }).success).toBe(false);
  });
});
