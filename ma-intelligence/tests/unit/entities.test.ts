import { describe, expect, it } from 'vitest';

import {
  assetSchema,
  claimSchema,
  companySchema,
  dealSchema,
  eventSchema,
  intelligenceDatabaseSchema,
  ownershipSchema,
  sourceSchema,
} from '@/domain/entities.js';
import {
  exampleAsset,
  exampleBuyer,
  exampleClaim,
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
    expect(
      companySchema.safeParse({
        ...exampleBuyer,
        latitude: null,
        longitude: null,
        coordinate_accuracy: 'unknown',
      }).success,
    ).toBe(true);
  });

  it('lehnt eine Koordinate ohne belegte Quelle ab', () => {
    // Regel 14 des Projekts: Koordinaten kommen aus einer Quelle oder es gibt
    // sie nicht. Das steht hier im Schema, damit es niemand vergessen kann.
    expect(companySchema.safeParse({ ...exampleBuyer, coordinate_source_url: null }).success).toBe(false);
    expect(
      companySchema.safeParse({
        ...exampleBuyer,
        latitude: null,
        longitude: null,
        coordinate_accuracy: 'unknown',
        coordinate_source_url: null,
      }).success,
    ).toBe(true);
  });

  it('haelt die Genauigkeit der Koordinate fest', () => {
    expect(companySchema.safeParse({ ...exampleBuyer, coordinate_accuracy: 'headquarters' }).success).toBe(true);
    // Ohne Koordinate gibt es nichts, dessen Genauigkeit man angeben koennte.
    expect(
      companySchema.safeParse({ ...exampleBuyer, latitude: null, longitude: null }).success,
    ).toBe(false);
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
    // Verkaufsprozess ohne bekannten Kaeufer: leere Liste, kein Platzhalter.
    expect(dealSchema.safeParse({ ...exampleDeal, buyers: [], status: 'sale_process' }).success).toBe(true);
    expect(
      dealSchema.safeParse({
        ...exampleDeal,
        buyers: [{ company_id: exampleDeal.target_company_id, name: null, share_percentage: null }],
      }).success,
    ).toBe(false);
  });

  it('traegt ein Kaeuferkonsortium', () => {
    const konsortium = {
      ...exampleDeal,
      buyers: [
        { company_id: exampleBuyer.id, name: null, share_percentage: 60 },
        { company_id: null, name: 'Mitinvestor Beteiligungs GmbH', share_percentage: 40 },
      ],
    };
    expect(dealSchema.safeParse(konsortium).success).toBe(true);
  });

  it('traegt mehrere Verkaeufer und einen unbekannten Verkaeufer', () => {
    expect(
      dealSchema.safeParse({
        ...exampleDeal,
        sellers: [
          { company_id: null, name: 'Familie Mustermann', share_percentage: 51 },
          { company_id: null, name: 'Streubesitz', share_percentage: 49 },
        ],
      }).success,
    ).toBe(true);
    // Unbekannter Verkaeufer ist die leere Liste, nicht ein erfundener Name.
    expect(dealSchema.safeParse({ ...exampleDeal, sellers: [] }).success).toBe(true);
  });

  it('verlangt fuer jede Partei eine Identitaet', () => {
    expect(
      dealSchema.safeParse({
        ...exampleDeal,
        buyers: [{ company_id: null, name: null, share_percentage: 50 }],
      }).success,
    ).toBe(false);
  });

  it('bildet eine Beteiligungserhoehung ab', () => {
    const erhoehung = {
      ...exampleDeal,
      deal_type: 'majority_stake' as const,
      stake_before_percentage: 25,
      stake_acquired_percentage: 30,
      stake_after_percentage: 55,
    };
    expect(dealSchema.safeParse(erhoehung).success).toBe(true);
    // Rechnet die Quelle falsch, faellt es auf.
    expect(dealSchema.safeParse({ ...erhoehung, stake_after_percentage: 80 }).success).toBe(false);
    // Ein Anteil kann durch einen Zukauf nicht sinken.
    expect(
      dealSchema.safeParse({ ...erhoehung, stake_acquired_percentage: null, stake_after_percentage: 10 }).success,
    ).toBe(false);
  });

  it('trennt wirtschaftliche Form und rechtliche Umsetzung', () => {
    expect(dealSchema.safeParse({ ...exampleDeal, transaction_structure: 'share_deal' }).success).toBe(true);
    // Ein Asset-Deal muss sagen, welche Standorte uebergehen.
    expect(dealSchema.safeParse({ ...exampleDeal, transaction_structure: 'asset_deal' }).success).toBe(false);
    expect(
      dealSchema.safeParse({
        ...exampleDeal,
        transaction_structure: 'asset_deal',
        asset_ids: [exampleAsset.id],
      }).success,
    ).toBe(true);
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

  it('haelt eine Beteiligung an einem Standort', () => {
    const amStandort = {
      ...exampleOwnership,
      owned_id: exampleAsset.id,
      relationship_type: 'asset_owner' as const,
    };
    expect(ownershipSchema.safeParse(amStandort).success).toBe(true);
    // Ein Werk ist kein Aktionaer.
    expect(ownershipSchema.safeParse({ ...amStandort, relationship_type: 'shareholder' }).success).toBe(false);
    // Und eine Gesellschaft ist kein Standort.
    expect(ownershipSchema.safeParse({ ...exampleOwnership, relationship_type: 'asset_owner' }).success).toBe(false);
  });

  it('traegt mehrere gleichzeitige Eigentuemer desselben Objekts', () => {
    const ersterEigentuemer = { ...exampleOwnership, ownership_percentage: 60 };
    const zweiterEigentuemer = {
      ...exampleOwnership,
      id: 'ownership_zweiter__musterwerke_gmbh__2025_11_04',
      owner_id: 'company_zweiter_investor_ag',
      ownership_percentage: 40,
    };
    expect(ownershipSchema.safeParse(ersterEigentuemer).success).toBe(true);
    expect(ownershipSchema.safeParse(zweiterEigentuemer).success).toBe(true);
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

  it('unterscheidet Haupt- und Nebenprodukt eines Standorts', () => {
    const mitBeiprodukt = {
      ...exampleAsset,
      commodities: [
        { commodity_id: exampleCommodity.id, role: 'primary' as const },
        { commodity_id: 'commodity_gold', role: 'byproduct' as const },
      ],
    };
    expect(assetSchema.safeParse(mitBeiprodukt).success).toBe(true);
    // Derselbe Rohstoff zweimal waere eine doppelte Aussage.
    expect(
      assetSchema.safeParse({
        ...exampleAsset,
        commodities: [
          { commodity_id: exampleCommodity.id, role: 'primary' },
          { commodity_id: exampleCommodity.id, role: 'byproduct' },
        ],
      }).success,
    ).toBe(false);
  });

  it('fuehrt kein Eigentum am Standort — das steht in Ownership', () => {
    expect(assetSchema.safeParse({ ...exampleAsset, owner_id: exampleTarget.id }).success).toBe(false);
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
      claims: [exampleClaim],
    };
    expect(intelligenceDatabaseSchema.parse(database)).toEqual(database);
  });

  it('verlangt jede Sammlung, auch wenn sie leer ist', () => {
    expect(intelligenceDatabaseSchema.safeParse({ companies: [], deals: [] }).success).toBe(false);
  });
});

describe('claimSchema — Quellen belegen einzelne Aussagen', () => {
  it('nimmt einen Beleg fuer ein einzelnes Feld an', () => {
    expect(claimSchema.parse(exampleClaim)).toEqual(exampleClaim);
  });

  it('erlaubt einen Beleg fuer den Datensatz als Ganzes', () => {
    expect(claimSchema.safeParse({ ...exampleClaim, field: null }).success).toBe(true);
  });

  it('verlangt, dass subject_id zum subject_type passt', () => {
    expect(claimSchema.safeParse({ ...exampleClaim, subject_type: 'company' }).success).toBe(false);
    expect(
      claimSchema.safeParse({ ...exampleClaim, subject_type: 'deal', subject_id: exampleDeal.id }).success,
    ).toBe(true);
  });

  it('verlangt eine lesbare Aussage', () => {
    expect(claimSchema.safeParse({ ...exampleClaim, statement: 'ja' }).success).toBe(false);
  });
});

describe('eventSchema — Abgrenzung zum Deal', () => {
  const baseEvent = {
    id: 'event_2025_11_04_0a1b2c3d',
    event_type: 'deal_announced' as const,
    date: '2025-11-04',
    headline: 'Beispiel Chemie kuendigt Uebernahme an',
    description: null,
    company_ids: [exampleBuyer.id],
    asset_ids: [],
    deal_ids: [exampleDeal.id],
    source_ids: [exampleSource.id],
    confidence: 75,
    evidence: 'FACT' as const,
    notes: null,
    created_at: exampleDeal.created_at,
    updated_at: exampleDeal.updated_at,
  };

  it('nimmt ein Ereignis an, das seinen Deal benennt', () => {
    expect(eventSchema.safeParse(baseEvent).success).toBe(true);
  });

  it('weist ein Deal-Ereignis ohne Deal ab — sonst entsteht eine zweite Wahrheit', () => {
    expect(eventSchema.safeParse({ ...baseEvent, deal_ids: [] }).success).toBe(false);
  });

  it('laesst ein Ereignis ohne Deal zu, wenn es keines ist', () => {
    expect(
      eventSchema.safeParse({ ...baseEvent, event_type: 'management_change', deal_ids: [] }).success,
    ).toBe(true);
  });

  it('traegt keine Transaktionsfelder', () => {
    expect(eventSchema.safeParse({ ...baseEvent, deal_value: 120_000_000 }).success).toBe(false);
    expect(eventSchema.safeParse({ ...baseEvent, status: 'announced' }).success).toBe(false);
  });
});
