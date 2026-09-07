/**
 * Referentielle Integritaet des Datenbestands.
 *
 * Das Schema prueft jeden Datensatz fuer sich. Was es nicht sehen kann: ob die
 * ID, auf die ein Deal zeigt, ueberhaupt existiert. Genau dort entstehen die
 * Fehler, die auf der Karte als leerer Marker oder fehlender Kaeufer auffallen —
 * und dann ist es zu spaet.
 *
 * Reine Funktionen, kein Dateizugriff.
 */

import type { Claim, IntelligenceDatabase } from '../domain/types.js';

export type IntegritySeverity = 'error' | 'warning';

export interface IntegrityIssue {
  severity: IntegritySeverity;
  /** Der Datensatz, an dem der Befund haengt. */
  record: string;
  message: string;
}

interface Reference {
  from: string;
  field: string;
  id: string;
  collection: 'companies' | 'deals' | 'ownerships' | 'assets' | 'commodities' | 'sources' | 'events';
}

function collectReferences(database: IntelligenceDatabase): Reference[] {
  const references: Reference[] = [];
  const push = (from: string, field: string, id: string, collection: Reference['collection']) => {
    references.push({ from, field, id, collection });
  };

  for (const company of database.companies) {
    for (const sourceId of company.source_ids) push(company.id, 'source_ids', sourceId, 'sources');
  }

  for (const deal of database.deals) {
    push(deal.id, 'target_company_id', deal.target_company_id, 'companies');
    deal.buyers.forEach((party, index) => {
      if (party.company_id !== null) push(deal.id, `buyers[${index}]`, party.company_id, 'companies');
    });
    deal.sellers.forEach((party, index) => {
      if (party.company_id !== null) push(deal.id, `sellers[${index}]`, party.company_id, 'companies');
    });
    for (const assetId of deal.asset_ids) push(deal.id, 'asset_ids', assetId, 'assets');
    for (const sourceId of deal.source_ids) push(deal.id, 'source_ids', sourceId, 'sources');
  }

  for (const ownership of database.ownerships) {
    push(ownership.id, 'owner_id', ownership.owner_id, 'companies');
    push(
      ownership.id,
      'owned_id',
      ownership.owned_id,
      ownership.owned_id.startsWith('asset_') ? 'assets' : 'companies',
    );
    for (const sourceId of ownership.source_ids) push(ownership.id, 'source_ids', sourceId, 'sources');
  }

  for (const asset of database.assets) {
    if (asset.operator_id !== null) push(asset.id, 'operator_id', asset.operator_id, 'companies');
    for (const entry of asset.commodities) push(asset.id, 'commodities', entry.commodity_id, 'commodities');
    for (const sourceId of asset.source_ids) push(asset.id, 'source_ids', sourceId, 'sources');
  }

  for (const event of database.events) {
    for (const id of event.company_ids) push(event.id, 'company_ids', id, 'companies');
    for (const id of event.asset_ids) push(event.id, 'asset_ids', id, 'assets');
    for (const id of event.deal_ids) push(event.id, 'deal_ids', id, 'deals');
    for (const sourceId of event.source_ids) push(event.id, 'source_ids', sourceId, 'sources');
  }

  for (const claim of database.claims) {
    push(claim.id, 'source_id', claim.source_id, 'sources');
  }

  return references;
}

/** Alle `source_ids` eines Datensatzes, egal aus welcher Sammlung er stammt. */
function sourceIdsOfSubject(database: IntelligenceDatabase, claim: Claim): readonly string[] | null {
  switch (claim.subject_type) {
    case 'company':
      return database.companies.find((entry) => entry.id === claim.subject_id)?.source_ids ?? null;
    case 'deal':
      return database.deals.find((entry) => entry.id === claim.subject_id)?.source_ids ?? null;
    case 'ownership':
      return database.ownerships.find((entry) => entry.id === claim.subject_id)?.source_ids ?? null;
    case 'asset':
      return database.assets.find((entry) => entry.id === claim.subject_id)?.source_ids ?? null;
    case 'event':
      return database.events.find((entry) => entry.id === claim.subject_id)?.source_ids ?? null;
  }
}

export function checkIntegrity(database: IntelligenceDatabase): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];

  const known: Record<Reference['collection'], Set<string>> = {
    companies: new Set(database.companies.map((entry) => entry.id)),
    deals: new Set(database.deals.map((entry) => entry.id)),
    ownerships: new Set(database.ownerships.map((entry) => entry.id)),
    assets: new Set(database.assets.map((entry) => entry.id)),
    commodities: new Set(database.commodities.map((entry) => entry.id)),
    sources: new Set(database.sources.map((entry) => entry.id)),
    events: new Set(database.events.map((entry) => entry.id)),
  };

  // Doppelte IDs zuerst: sie machen jede weitere Aussage unsicher.
  const collections = [
    ['companies', database.companies],
    ['deals', database.deals],
    ['ownerships', database.ownerships],
    ['assets', database.assets],
    ['commodities', database.commodities],
    ['sources', database.sources],
    ['events', database.events],
    ['claims', database.claims],
  ] as const;

  for (const [name, records] of collections) {
    const seen = new Set<string>();
    for (const record of records) {
      if (seen.has(record.id)) {
        issues.push({ severity: 'error', record: record.id, message: `ID kommt in ${name} mehrfach vor` });
      }
      seen.add(record.id);
    }
  }

  for (const reference of collectReferences(database)) {
    if (!known[reference.collection].has(reference.id)) {
      issues.push({
        severity: 'error',
        record: reference.from,
        message: `${reference.field} verweist auf ${reference.id}, das es in ${reference.collection} nicht gibt`,
      });
    }
  }

  for (const claim of database.claims) {
    const sourceIds = sourceIdsOfSubject(database, claim);
    if (sourceIds === null) {
      issues.push({
        severity: 'error',
        record: claim.id,
        message: `subject_id verweist auf ${claim.subject_id}, das es nicht gibt`,
      });
      continue;
    }
    // Ein Beleg, dessen Quelle am Datensatz selbst nicht steht, ist unauffindbar.
    if (!sourceIds.includes(claim.source_id)) {
      issues.push({
        severity: 'error',
        record: claim.id,
        message: `Quelle ${claim.source_id} fehlt in den source_ids von ${claim.subject_id}`,
      });
    }
  }

  // Warnungen: nicht falsch, aber ein Hinweis auf unfertige Erfassung.
  for (const deal of database.deals) {
    if (deal.source_ids.length === 0) {
      issues.push({ severity: 'warning', record: deal.id, message: 'Deal ohne Quelle' });
    }
    if (deal.status === 'completed' && deal.completion_date === null) {
      issues.push({ severity: 'warning', record: deal.id, message: 'Vollzogener Deal ohne Vollzugsdatum' });
    }
    if (deal.buyers.length === 0 && !['rumored', 'sale_process', 'cancelled'].includes(deal.status)) {
      issues.push({
        severity: 'warning',
        record: deal.id,
        message: `Deal im Status ${deal.status} ohne Kaeufer`,
      });
    }
  }

  for (const company of database.companies) {
    if (company.source_ids.length === 0) {
      issues.push({ severity: 'warning', record: company.id, message: 'Unternehmen ohne Quelle' });
    }
  }

  return issues;
}

export function hasErrors(issues: readonly IntegrityIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}
