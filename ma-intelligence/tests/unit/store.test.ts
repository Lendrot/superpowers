import { describe, expect, it } from 'vitest';

import { checkIntegrity, hasErrors } from '@/store/integrity.js';
import { dealDate, dealView, filterDeals, industriesInUse, isUnconfirmed } from '@/store/query.js';
import { emptyDatabase } from '@/store/database.js';
import type { IntelligenceDatabase } from '@/domain/types.js';
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

function database(overrides: Partial<IntelligenceDatabase> = {}): IntelligenceDatabase {
  return {
    ...emptyDatabase(),
    companies: [exampleBuyer, exampleTarget],
    deals: [exampleDeal],
    ownerships: [exampleOwnership],
    assets: [exampleAsset],
    commodities: [exampleCommodity],
    sources: [exampleSource],
    events: [],
    claims: [exampleClaim],
    ...overrides,
  };
}

describe('checkIntegrity — gebrochene Verweise', () => {
  it('meldet nichts bei einem stimmigen Bestand', () => {
    expect(checkIntegrity(database()).filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('findet ein Zielunternehmen, das es nicht gibt', () => {
    const broken = database({ companies: [exampleBuyer] });
    const issues = checkIntegrity(broken);
    expect(hasErrors(issues)).toBe(true);
    expect(issues.some((issue) => issue.message.includes('target_company_id'))).toBe(true);
  });

  it('findet einen Kaeufer, den es nicht gibt', () => {
    const broken = database({
      deals: [{ ...exampleDeal, buyers: [{ company_id: 'company_gibt_es_nicht', name: null, share_percentage: null }] }],
    });
    expect(hasErrors(checkIntegrity(broken))).toBe(true);
  });

  it('findet eine doppelte ID', () => {
    const broken = database({ companies: [exampleBuyer, exampleBuyer, exampleTarget] });
    expect(checkIntegrity(broken).some((issue) => issue.message.includes('mehrfach'))).toBe(true);
  });

  it('findet einen Beleg, dessen Quelle am Datensatz nicht steht', () => {
    const broken = database({
      ownerships: [{ ...exampleOwnership, source_ids: [] }],
    });
    const issues = checkIntegrity(broken);
    expect(issues.some((issue) => issue.message.includes('fehlt in den source_ids'))).toBe(true);
  });

  it('findet einen Beleg auf einen Datensatz, den es nicht gibt', () => {
    const broken = database({
      claims: [{ ...exampleClaim, subject_type: 'deal', subject_id: 'deal_gibt_es_nicht__x__2025' }],
    });
    expect(hasErrors(checkIntegrity(broken))).toBe(true);
  });

  it('warnt, statt zu blockieren, wenn ein vollzogener Deal kein Datum hat', () => {
    const db = database({
      deals: [{ ...exampleDeal, status: 'completed', completion_date: null }],
    });
    const issues = checkIntegrity(db);
    expect(hasErrors(issues)).toBe(false);
    expect(issues.some((issue) => issue.severity === 'warning')).toBe(true);
  });

  it('warnt bei einem Deal ohne Quelle', () => {
    const db = database({ deals: [{ ...exampleDeal, source_ids: [] }], claims: [] });
    expect(checkIntegrity(db).some((issue) => issue.message === 'Deal ohne Quelle')).toBe(true);
  });
});

describe('filterDeals — die drei Filter der Deutschland-Ansicht', () => {
  const geruecht = {
    ...exampleDeal,
    id: 'deal_musterwerke_gmbh__unknown_buyer__2024' as const,
    status: 'rumored' as const,
    buyers: [],
    announcement_date: '2024-03-01',
    completion_date: null,
    deal_value: null,
    currency: null,
    stake_acquired_percentage: null,
    stake_before_percentage: null,
    stake_after_percentage: null,
  };
  const db = database({ deals: [exampleDeal, geruecht] });

  it('filtert nach Status', () => {
    expect(filterDeals(db, { statuses: ['rumored'] }).map((deal) => deal.id)).toEqual([geruecht.id]);
    expect(filterDeals(db, { statuses: ['announced', 'rumored'] })).toHaveLength(2);
    expect(filterDeals(db, {})).toHaveLength(2);
  });

  it('filtert nach Branche des Zielunternehmens', () => {
    expect(filterDeals(db, { industries: ['industrial_manufacturing'] })).toHaveLength(2);
    expect(filterDeals(db, { industries: ['pharma_healthcare'] })).toHaveLength(0);
  });

  it('filtert nach Zeitraum', () => {
    expect(filterDeals(db, { from: '2025-01-01' }).map((deal) => deal.id)).toEqual([exampleDeal.id]);
    expect(filterDeals(db, { to: '2024-12-31' }).map((deal) => deal.id)).toEqual([geruecht.id]);
    expect(filterDeals(db, { from: '2024-01-01', to: '2025-12-31' })).toHaveLength(2);
  });

  it('nimmt einen Deal ohne Datum aus dem Zeitraumfilter heraus, statt ihn zu datieren', () => {
    const ohneDatum = { ...geruecht, announcement_date: null };
    expect(dealDate(ohneDatum)).toBeNull();
    expect(filterDeals(database({ deals: [ohneDatum] }), { from: '2000-01-01' })).toHaveLength(0);
  });

  it('filtert nach Land des Zielunternehmens', () => {
    expect(filterDeals(db, { targetCountry: 'DE' })).toHaveLength(2);
    expect(filterDeals(db, { targetCountry: 'FR' })).toHaveLength(0);
  });

  it('kombiniert die Filter', () => {
    expect(filterDeals(db, { statuses: ['announced'], from: '2025-01-01', targetCountry: 'DE' })).toHaveLength(1);
  });
});

describe('dealView — was die Detailansicht zeigt', () => {
  it('loest Ziel, Parteien und Quellen auf', () => {
    const view = dealView(database(), exampleDeal);
    expect(view.target?.display_name).toBe('Musterwerke');
    expect(view.buyerNames).toEqual(['Beispiel Chemie']);
    // Eine Partei ohne eigenen Knoten behaelt ihren gelieferten Namen.
    expect(view.sellerNames).toEqual(['Familie Mustermann']);
    expect(view.sources.map((source) => source.url)).toEqual(['https://example.org/meldung/1']);
  });

  it('markiert Geruechte als unbestaetigt', () => {
    expect(isUnconfirmed({ ...exampleDeal, status: 'rumored' })).toBe(true);
    expect(isUnconfirmed({ ...exampleDeal, status: 'sale_process' })).toBe(true);
    expect(isUnconfirmed({ ...exampleDeal, status: 'completed' })).toBe(false);
    expect(isUnconfirmed({ ...exampleDeal, status: 'announced' })).toBe(false);
  });

  it('nennt einen unbekannten Kaeufer unbekannt, statt ihn zu erfinden', () => {
    const view = dealView(database(), { ...exampleDeal, buyers: [{ company_id: null, name: null, share_percentage: null }] });
    expect(view.buyerNames).toEqual(['unbekannt']);
  });

  it('listet die tatsaechlich vorkommenden Branchen', () => {
    const db = database();
    expect(industriesInUse(db, db.deals)).toEqual(['industrial_manufacturing']);
  });
});
