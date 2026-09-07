/**
 * Die TypeScript-Sicht auf das Datenmodell.
 *
 * Alles hier ist aus den Zod-Schemas abgeleitet. Es gibt bewusst keine per Hand
 * geschriebenen Interfaces: ein zweites Modell driftet, und die Stelle, an der
 * es driftet, ist immer die, an der die Validierung etwas durchlaesst, das der
 * Compiler fuer unmoeglich haelt.
 */

import type { z } from 'zod';

import type {
  assetCommoditySchema,
  assetSchema,
  claimSchema,
  commoditySchema,
  companyIdentifiersSchema,
  companySchema,
  dealPartySchema,
  dealSchema,
  eventSchema,
  evidenceStatusSchema,
  headquartersSchema,
  intelligenceDatabaseSchema,
  ownershipSchema,
  sourceSchema,
} from './entities.js';
import type {
  ASSET_OPERATIONAL_STATUSES,
  ASSET_TYPES,
  CLAIM_SUBJECT_TYPES,
  COMMODITY_CATEGORIES,
  COMMODITY_ROLES,
  COMPANY_STATUSES,
  COORDINATE_ACCURACIES,
  DEAL_STATUSES,
  DEAL_TYPES,
  ENTITY_TYPES,
  EVENT_TYPES,
  INDUSTRIES,
  OWNERSHIP_RELATIONSHIP_TYPES,
  SOURCE_TYPES,
  TRANSACTION_STRUCTURES,
} from './vocabulary.js';

export type Company = z.infer<typeof companySchema>;
export type CompanyIdentifiers = z.infer<typeof companyIdentifiersSchema>;
export type Headquarters = z.infer<typeof headquartersSchema>;
export type Deal = z.infer<typeof dealSchema>;
export type DealParty = z.infer<typeof dealPartySchema>;
export type Ownership = z.infer<typeof ownershipSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type AssetCommodity = z.infer<typeof assetCommoditySchema>;
export type Commodity = z.infer<typeof commoditySchema>;
export type Source = z.infer<typeof sourceSchema>;
export type IntelligenceEvent = z.infer<typeof eventSchema>;
export type IntelligenceDatabase = z.infer<typeof intelligenceDatabaseSchema>;
export type Claim = z.infer<typeof claimSchema>;

export type EvidenceStatus = z.infer<typeof evidenceStatusSchema>;

export type EntityType = (typeof ENTITY_TYPES)[number];
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];
export type CoordinateAccuracy = (typeof COORDINATE_ACCURACIES)[number];
export type Industry = (typeof INDUSTRIES)[number];
export type DealStatus = (typeof DEAL_STATUSES)[number];
export type DealType = (typeof DEAL_TYPES)[number];
export type TransactionStructure = (typeof TRANSACTION_STRUCTURES)[number];
export type OwnershipRelationshipType = (typeof OWNERSHIP_RELATIONSHIP_TYPES)[number];
export type AssetType = (typeof ASSET_TYPES)[number];
export type AssetOperationalStatus = (typeof ASSET_OPERATIONAL_STATUSES)[number];
export type CommodityCategory = (typeof COMMODITY_CATEGORIES)[number];
export type CommodityRole = (typeof COMMODITY_ROLES)[number];
export type ClaimSubjectType = (typeof CLAIM_SUBJECT_TYPES)[number];
export type SourceType = (typeof SOURCE_TYPES)[number];
export type EventType = (typeof EVENT_TYPES)[number];

/** Ein Datensatz mit Belegspur — alles ausser `Commodity` und `Source`. */
export type ProvenanceBearing = Company | Deal | Ownership | Asset | IntelligenceEvent;
