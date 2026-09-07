/**
 * Abfragen auf dem Datenbestand.
 *
 * Reine Funktionen ueber der geladenen Datenbank — genau die Filter, die die
 * Deutschland-Ansicht braucht, und keine mehr. Solange der Bestand in den
 * Speicher passt, ist das die einfachste Loesung, die funktioniert; ab wann
 * nicht mehr, steht in docs/decisions.md #2.
 */

import type {
  Company,
  Deal,
  DealStatus,
  Industry,
  IntelligenceDatabase,
  Source,
} from '../domain/types.js';
import { UNCONFIRMED_DEAL_STATUSES } from '../domain/vocabulary.js';

export interface DealFilter {
  /** Leer heisst: alle Status. */
  statuses?: readonly DealStatus[];
  industries?: readonly Industry[];
  /** ISO-Datum, einschliesslich. Verglichen wird das massgebliche Datum. */
  from?: string;
  to?: string;
  /** ISO-3166-alpha-2 des Zielunternehmens. */
  targetCountry?: string;
}

/**
 * Das Datum, an dem ein Deal in einer Zeitleiste haengt: der Vollzug, wenn es
 * ihn gibt, sonst die Ankuendigung. Ein Deal ohne beides hat keine Zeit und
 * faellt aus jedem Zeitraumfilter — sichtbar, statt still auf heute gesetzt.
 */
export function dealDate(deal: Deal): string | null {
  return deal.completion_date ?? deal.announcement_date;
}

/** Geruecht und Verkaufsprozess sind unbestaetigt und muessen es bleiben. */
export function isUnconfirmed(deal: Deal): boolean {
  return (UNCONFIRMED_DEAL_STATUSES as readonly string[]).includes(deal.status);
}

export function companyById(database: IntelligenceDatabase, id: string): Company | null {
  return database.companies.find((company) => company.id === id) ?? null;
}

export function sourcesOf(database: IntelligenceDatabase, sourceIds: readonly string[]): Source[] {
  return sourceIds
    .map((id) => database.sources.find((source) => source.id === id))
    .filter((source): source is Source => source !== undefined);
}

export function filterDeals(database: IntelligenceDatabase, filter: DealFilter = {}): Deal[] {
  return database.deals.filter((deal) => {
    if (filter.statuses !== undefined && filter.statuses.length > 0 && !filter.statuses.includes(deal.status)) {
      return false;
    }

    const target = companyById(database, deal.target_company_id);

    if (filter.targetCountry !== undefined && target?.country !== filter.targetCountry) return false;

    if (filter.industries !== undefined && filter.industries.length > 0) {
      if (target === null || !filter.industries.includes(target.industry)) return false;
    }

    if (filter.from !== undefined || filter.to !== undefined) {
      const date = dealDate(deal);
      if (date === null) return false;
      if (filter.from !== undefined && date < filter.from) return false;
      if (filter.to !== undefined && date > filter.to) return false;
    }

    return true;
  });
}

/**
 * Ein Deal mit allem, was die Detailansicht zeigt: Zielunternehmen, Parteien im
 * Klartext und die Quellen. Namen werden aufgeloest, nicht erraten — eine
 * Partei ohne Knoten behaelt ihren gelieferten Namen.
 */
export interface DealView {
  deal: Deal;
  target: Company | null;
  buyerNames: string[];
  sellerNames: string[];
  sources: Source[];
  unconfirmed: boolean;
}

export function dealView(database: IntelligenceDatabase, deal: Deal): DealView {
  const partyName = (party: { company_id: string | null; name: string | null }): string => {
    if (party.company_id !== null) {
      const company = companyById(database, party.company_id);
      if (company !== null) return company.display_name;
    }
    return party.name ?? 'unbekannt';
  };

  return {
    deal,
    target: companyById(database, deal.target_company_id),
    buyerNames: deal.buyers.map(partyName),
    sellerNames: deal.sellers.map(partyName),
    sources: sourcesOf(database, deal.source_ids),
    unconfirmed: isUnconfirmed(deal),
  };
}

/** Die Branchen, die im gefilterten Bestand tatsaechlich vorkommen. */
export function industriesInUse(database: IntelligenceDatabase, deals: readonly Deal[]): Industry[] {
  const industries = new Set<Industry>();
  for (const deal of deals) {
    const target = companyById(database, deal.target_company_id);
    if (target !== null) industries.add(target.industry);
  }
  return [...industries].sort();
}
