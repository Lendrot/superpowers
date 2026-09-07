/**
 * Das Buendel, das die Deutschland-Ansicht anzeigt.
 *
 * Reine Funktion ueber der gepruefeten Datenbank: die Seite bekommt fertige
 * Zeilen und rechnet selbst nichts aus. Damit ist das, was ein Nutzer sieht,
 * hier testbar — und nicht erst im Browser.
 */

import type { IntelligenceDatabase, Industry } from '../domain/types.js';
import { DEAL_STATUS_LABELS_DE, DEAL_STATUSES, INDUSTRY_LABELS_DE } from '../domain/vocabulary.js';
import { dealDate, dealView, filterDeals, industriesInUse } from './query.js';

export interface MapBundle {
  meta: {
    /** Stand der Daten, abgeleitet aus dem Bestand — nicht aus der Uhr. */
    data_as_of: string;
    scope: string;
    deal_count: number;
    located_count: number;
    undated_count: number;
    source_count: number;
    disclaimer: string;
  };
  filters: {
    statuses: { key: string; label: string; count: number }[];
    industries: { key: Industry; label: string; count: number }[];
    date_range: { from: string | null; to: string | null };
  };
  deals: MapDeal[];
}

export interface MapDeal {
  id: string;
  target: {
    name: string;
    legal_name: string | null;
    city: string | null;
    region: string | null;
    latitude: number | null;
    longitude: number | null;
    coordinate_accuracy: string;
    industry: Industry;
    industry_label: string;
  };
  buyers: string[];
  sellers: string[];
  status: string;
  status_label: string;
  unconfirmed: boolean;
  deal_type: string;
  transaction_structure: string;
  date: string | null;
  announcement_date: string | null;
  completion_date: string | null;
  deal_value: number | null;
  currency: string | null;
  stake_before_percentage: number | null;
  stake_acquired_percentage: number | null;
  stake_after_percentage: number | null;
  confidence: number;
  evidence: string;
  notes: string | null;
  sources: {
    title: string;
    publisher: string;
    url: string | null;
    source_type: string;
    publication_date: string | null;
    reliability_score: number;
  }[];
  claims: { field: string | null; statement: string; source_title: string | null; source_url: string | null }[];
}

const DISCLAIMER =
  'Kleiner, handverlesener Datensatz zur Pruefung des Datenmodells — keine vollstaendige Erfassung des deutschen M&A-Markts. Jede Angabe traegt ihre Quelle.';

/** Juengster Bearbeitungsstand im Bestand; leer, wenn nichts drin ist. */
export function dataAsOf(database: IntelligenceDatabase): string | null {
  const stamps = [
    ...database.deals.map((deal) => deal.updated_at),
    ...database.companies.map((company) => company.updated_at),
  ].sort();
  return stamps.at(-1) ?? null;
}

export function buildMapBundle(database: IntelligenceDatabase, country = 'DE'): MapBundle {
  const deals = filterDeals(database, { targetCountry: country });

  const entries: MapDeal[] = deals
    .map((deal) => {
      const view = dealView(database, deal);
      const target = view.target;
      const industry: Industry = target?.industry ?? 'unknown';
      return {
        id: deal.id,
        target: {
          name: target?.display_name ?? 'unbekannt',
          legal_name: target?.legal_name ?? null,
          city: target?.headquarters.city ?? null,
          region: target?.headquarters.region ?? null,
          latitude: target?.latitude ?? null,
          longitude: target?.longitude ?? null,
          coordinate_accuracy: target?.coordinate_accuracy ?? 'unknown',
          industry,
          industry_label: INDUSTRY_LABELS_DE[industry],
        },
        buyers: view.buyerNames,
        sellers: view.sellerNames,
        status: deal.status,
        status_label: DEAL_STATUS_LABELS_DE[deal.status],
        unconfirmed: view.unconfirmed,
        deal_type: deal.deal_type,
        transaction_structure: deal.transaction_structure,
        date: dealDate(deal),
        announcement_date: deal.announcement_date,
        completion_date: deal.completion_date,
        deal_value: deal.deal_value,
        currency: deal.currency,
        stake_before_percentage: deal.stake_before_percentage,
        stake_acquired_percentage: deal.stake_acquired_percentage,
        stake_after_percentage: deal.stake_after_percentage,
        confidence: deal.confidence,
        evidence: deal.evidence,
        notes: deal.notes,
        sources: view.sources.map((source) => ({
          title: source.title,
          publisher: source.publisher,
          url: source.url,
          source_type: source.source_type,
          publication_date: source.publication_date,
          reliability_score: source.reliability_score,
        })),
        claims: database.claims
          .filter((claim) => claim.subject_id === deal.id)
          .map((claim) => {
            const source = database.sources.find((entry) => entry.id === claim.source_id);
            return {
              field: claim.field,
              statement: claim.statement,
              source_title: source?.title ?? null,
              source_url: source?.url ?? null,
            };
          }),
      };
    })
    // Neueste zuerst; ohne Datum ans Ende, statt sie stillschweigend zu datieren.
    .sort((left, right) => {
      if (left.date === null && right.date === null) return left.id.localeCompare(right.id);
      if (left.date === null) return 1;
      if (right.date === null) return -1;
      return right.date.localeCompare(left.date);
    });

  const dates = entries.map((entry) => entry.date).filter((date): date is string => date !== null);

  return {
    meta: {
      data_as_of: dataAsOf(database) ?? '',
      scope: `Deals mit Zielunternehmen in ${country}`,
      deal_count: entries.length,
      located_count: entries.filter((entry) => entry.target.latitude !== null).length,
      undated_count: entries.length - dates.length,
      source_count: database.sources.length,
      disclaimer: DISCLAIMER,
    },
    filters: {
      statuses: DEAL_STATUSES.filter((status) => entries.some((entry) => entry.status === status)).map((status) => ({
        key: status,
        label: DEAL_STATUS_LABELS_DE[status],
        count: entries.filter((entry) => entry.status === status).length,
      })),
      industries: industriesInUse(database, deals).map((industry) => ({
        key: industry,
        label: INDUSTRY_LABELS_DE[industry],
        count: entries.filter((entry) => entry.target.industry === industry).length,
      })),
      date_range: {
        from: dates.length === 0 ? null : dates.reduce((a, b) => (a < b ? a : b)),
        to: dates.length === 0 ? null : dates.reduce((a, b) => (a > b ? a : b)),
      },
    },
    deals: entries,
  };
}
