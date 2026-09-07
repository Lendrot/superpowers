/**
 * Testdaten.
 *
 * ACHTUNG: Alle Unternehmen, Deals und Standorte hier sind erfunden und als
 * solche erkennbar ("Beispiel", "Muster"). Sie duerfen nie in `data/` landen.
 * Echte Rechercheergebnisse kommen ueber die Import-Pipeline herein, nicht aus
 * einer Fixture-Datei.
 *
 * Ausnahme sind reine Namensbeispiele in `naming.test.ts`: dort steht ein
 * echter Firmenname, ueber den nichts behauptet wird ausser seiner Schreibweise.
 */

import type { Asset, Claim, Commodity, Company, Deal, Ownership, Source } from '@/domain/types.js';

const NOW = '2026-01-15T10:00:00.000Z';

export const exampleSource: Source = {
  id: 'source_beispielblatt_0a1b2c3d',
  url: 'https://example.org/meldung/1',
  publisher: 'Beispielblatt',
  title: 'Beispiel Chemie AG uebernimmt Musterwerke GmbH',
  publication_date: '2025-11-04',
  accessed_at: NOW,
  source_type: 'news_article',
  reliability_score: 70,
  language: 'de',
  archive_url: null,
};

export const exampleBuyer: Company = {
  id: 'company_beispiel_chemie_ag',
  entity_type: 'company',
  legal_name: 'Beispiel Chemie AG',
  display_name: 'Beispiel Chemie',
  former_names: [],
  aliases: ['Beispiel Chemie Group'],
  country: 'DE',
  headquarters: {
    city: 'Musterstadt',
    region: 'Bayern',
    street_address: null,
    postal_code: null,
  },
  latitude: 48.1372,
  longitude: 11.5756,
  coordinate_accuracy: 'locality',
  coordinate_source_url: 'https://example.org/orte/musterstadt',
  industry: 'chemicals',
  subindustry: 'Spezialchemie',
  website: 'https://example.org',
  status: 'active',
  identifiers: {
    lei: null,
    handelsregister: null,
    vat_id: null,
    isin: null,
    wikidata: null,
    domains: ['example.org'],
  },
  source_ids: [exampleSource.id],
  confidence: 80,
  evidence: 'FACT',
  notes: null,
  created_at: NOW,
  updated_at: NOW,
};

export const exampleTarget: Company = {
  ...exampleBuyer,
  id: 'company_musterwerke_gmbh',
  legal_name: 'Musterwerke GmbH',
  display_name: 'Musterwerke',
  aliases: [],
  headquarters: { city: 'Beispielheim', region: 'Hessen', street_address: null, postal_code: null },
  latitude: 50.1109,
  longitude: 8.6821,
  industry: 'industrial_manufacturing',
  subindustry: null,
  website: null,
  identifiers: { lei: null, handelsregister: null, vat_id: null, isin: null, wikidata: null, domains: [] },
};

export const exampleDeal: Deal = {
  id: 'deal_musterwerke_gmbh__beispiel_chemie_ag__2025',
  target_company_id: exampleTarget.id,
  buyers: [{ company_id: exampleBuyer.id, name: null, share_percentage: null }],
  sellers: [{ company_id: null, name: 'Familie Mustermann', share_percentage: null }],
  deal_type: 'acquisition',
  transaction_structure: 'share_deal',
  status: 'announced',
  announcement_date: '2025-11-04',
  completion_date: null,
  deal_value: 120_000_000,
  currency: 'EUR',
  stake_acquired_percentage: 100,
  stake_before_percentage: 0,
  stake_after_percentage: 100,
  asset_ids: [],
  source_ids: [exampleSource.id],
  confidence: 75,
  evidence: 'FACT',
  notes: null,
  created_at: NOW,
  updated_at: NOW,
};

export const exampleOwnership: Ownership = {
  id: 'ownership_beispiel_chemie_ag__musterwerke_gmbh__2025_11_04',
  owner_id: exampleBuyer.id,
  owned_id: exampleTarget.id,
  ownership_percentage: 100,
  relationship_type: 'parent',
  valid_from: '2025-11-04',
  valid_to: null,
  source_ids: [exampleSource.id],
  confidence: 75,
  evidence: 'INFERENCE',
  notes: 'Folgt aus dem angekuendigten Deal, noch nicht vollzogen.',
  created_at: NOW,
  updated_at: NOW,
};

export const exampleCommodity: Commodity = {
  id: 'commodity_kupfer',
  name: 'Copper',
  name_de: 'Kupfer',
  symbol: 'Cu',
  category: 'base_metal',
  aliases: ['Cu'],
  eu_critical_raw_material: null,
};

export const exampleAsset: Asset = {
  id: 'asset_musterhuette_beispielheim',
  name: 'Musterhuette Beispielheim',
  asset_type: 'smelter',
  operator_id: exampleTarget.id,
  country: 'DE',
  region: 'Hessen',
  latitude: 50.1109,
  longitude: 8.6821,
  coordinate_accuracy: 'locality',
  operational_status: 'operating',
  commodities: [{ commodity_id: exampleCommodity.id, role: 'primary' }],
  source_ids: [exampleSource.id],
  confidence: 60,
  evidence: 'FACT',
  notes: null,
  created_at: NOW,
  updated_at: NOW,
};

/**
 * Ein Beleg fuer eine einzelne Aussage: welche Quelle stuetzt genau welches
 * Feld welches Datensatzes.
 */
export const exampleClaim: Claim = {
  id: 'claim_0a1b2c3d4e5f',
  subject_type: 'ownership',
  subject_id: exampleOwnership.id,
  field: 'ownership_percentage',
  statement: 'Beispiel Chemie haelt nach Vollzug 100 % an Musterwerke.',
  source_id: exampleSource.id,
  evidence: 'FACT',
  confidence: 75,
  created_at: NOW,
};
