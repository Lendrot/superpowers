/**
 * Das Kern-Datenmodell.
 *
 * Zod ist die einzige Wahrheit ueber die Form der Daten: die TypeScript-Typen
 * (`types.ts`) werden daraus abgeleitet, die Import-Pipeline validiert damit,
 * und die JSON-Dateien auf der Platte haben genau diese Form. Es gibt kein
 * zweites, per Hand gepflegtes Typmodell, das davon abdriften koennte.
 *
 * Das Modell ist ein Graph, keine Kartenansicht: Koordinaten sind Attribute von
 * Unternehmen und Assets, nicht ihr Zweck. Die Karte ist eine von mehreren
 * moeglichen Sichten (siehe docs/architecture.md).
 */

import { z } from 'zod';

import { ID_PREFIXES, isId } from './ids.js';
import type { AssetId, CommodityId, CompanyId, DealId, EventId, IdPrefix, OwnershipId, SourceId } from './ids.js';
import {
  confidenceSchema,
  countryCodeSchema,
  currencyCodeSchema,
  isoDateSchema,
  isoDateTimeSchema,
  latitudeSchema,
  longitudeSchema,
  nonEmptyStringSchema,
  percentageSchema,
  urlSchema,
} from './primitives.js';
import {
  ASSET_OPERATIONAL_STATUSES,
  ASSET_TYPES,
  COMMODITY_CATEGORIES,
  COMPANY_STATUSES,
  DEAL_STATUSES,
  DEAL_TYPES,
  ENTITY_TYPES,
  EVENT_TYPES,
  EVIDENCE_STATUSES,
  INDUSTRIES,
  OWNERSHIP_RELATIONSHIP_TYPES,
  SOURCE_TYPES,
} from './vocabulary.js';

// ── ID-Schemas ───────────────────────────────────────────────────────────────

function idSchema<P extends IdPrefix, T extends `${P}_${string}`>(prefix: P) {
  return z.custom<T>((value) => isId(prefix, value), {
    message: `Muss eine ${prefix}-ID sein (${prefix}_<slug>)`,
  });
}

export const companyIdSchema = idSchema<'company', CompanyId>('company');
export const dealIdSchema = idSchema<'deal', DealId>('deal');
export const ownershipIdSchema = idSchema<'ownership', OwnershipId>('ownership');
export const assetIdSchema = idSchema<'asset', AssetId>('asset');
export const commodityIdSchema = idSchema<'commodity', CommodityId>('commodity');
export const sourceIdSchema = idSchema<'source', SourceId>('source');
export const eventIdSchema = idSchema<'event', EventId>('event');

export const anyIdSchema = z
  .string()
  .refine((value) => ID_PREFIXES.some((prefix) => isId(prefix, value)), 'Unbekanntes ID-Format');

// ── Gemeinsame Felder ────────────────────────────────────────────────────────

export const evidenceStatusSchema = z.enum(EVIDENCE_STATUSES);

/**
 * Jeder inhaltliche Datensatz traegt dieselbe Belegspur: woher die Aussage
 * kommt (`source_ids`), wie sicher sie ist (`confidence`), welchen Status sie
 * hat (`evidence`) und wann sie zuletzt angefasst wurde.
 *
 * `source_ids` ist bewusst ein Pflichtfeld — auch wenn das Array leer sein darf.
 * Ein Datensatz ohne Quellen ist damit sichtbar quellenlos und faellt in der
 * Pruefung auf, statt einfach kein Feld zu haben.
 */
const provenanceFields = {
  source_ids: z.array(sourceIdSchema),
  confidence: confidenceSchema,
  evidence: evidenceStatusSchema,
  notes: nonEmptyStringSchema.nullable(),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
};

// ── Company ──────────────────────────────────────────────────────────────────

export const companyIdentifiersSchema = z.object({
  /** Legal Entity Identifier, 20 alphanumerische Zeichen. */
  lei: z.string().regex(/^[A-Z0-9]{20}$/, 'LEI besteht aus 20 alphanumerischen Zeichen').nullable(),
  /** Handelsregister-Nummer inkl. Gericht, z. B. "HRB 6000 (AG Ludwigshafen)". */
  handelsregister: nonEmptyStringSchema.nullable(),
  vat_id: nonEmptyStringSchema.nullable(),
  isin: z.string().regex(/^[A-Z]{2}[A-Z0-9]{9}\d$/, 'ISIN ist zwoelfstellig').nullable(),
  /** Wikidata-Q-ID, nuetzlich als Bruecke zu offenen Datenquellen. */
  wikidata: z.string().regex(/^Q\d+$/, 'Wikidata-ID hat die Form Q12345').nullable(),
  /** Normalisierte Hostnamen ohne "www." — starkes Signal beim Entity Matching. */
  domains: z.array(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'Domain ohne Schema und ohne Pfad')),
});

export const headquartersSchema = z.object({
  city: nonEmptyStringSchema.nullable(),
  /** Bundesland bzw. Region. */
  region: nonEmptyStringSchema.nullable(),
  street_address: nonEmptyStringSchema.nullable(),
  postal_code: nonEmptyStringSchema.nullable(),
});

export const companySchema = z
  .object({
    id: companyIdSchema,
    /** Was fuer ein Akteur das ist — auch Personen und Staaten sind Knoten. */
    entity_type: z.enum(ENTITY_TYPES),
    /** Firmierung laut Register, mit Rechtsform. */
    legal_name: nonEmptyStringSchema,
    /** Gelaeufiger Name fuer die Oberflaeche. */
    display_name: nonEmptyStringSchema,
    former_names: z.array(nonEmptyStringSchema),
    /** Schreibvarianten und Kurzformen — Futter fuer die Entity Resolution. */
    aliases: z.array(nonEmptyStringSchema),
    country: countryCodeSchema,
    headquarters: headquartersSchema,
    latitude: latitudeSchema.nullable(),
    longitude: longitudeSchema.nullable(),
    industry: z.enum(INDUSTRIES),
    subindustry: nonEmptyStringSchema.nullable(),
    website: urlSchema.nullable(),
    status: z.enum(COMPANY_STATUSES),
    identifiers: companyIdentifiersSchema,
    ...provenanceFields,
  })
  .strict()
  .refine(
    (company) => (company.latitude === null) === (company.longitude === null),
    'Breiten- und Laengengrad muessen beide gesetzt oder beide null sein',
  );

// ── Deal ─────────────────────────────────────────────────────────────────────

export const dealSchema = z
  .object({
    id: dealIdSchema,
    target_company_id: companyIdSchema,
    /** Im Verkaufsprozess oft noch offen — dann null, nicht geraten. */
    buyer_company_id: companyIdSchema.nullable(),
    seller_company_id: companyIdSchema.nullable(),
    /** Verkaeufer, der (noch) kein eigener Knoten ist, z. B. eine Familie. */
    seller_name: nonEmptyStringSchema.nullable(),
    deal_type: z.enum(DEAL_TYPES),
    status: z.enum(DEAL_STATUSES),
    announcement_date: isoDateSchema.nullable(),
    completion_date: isoDateSchema.nullable(),
    /** Transaktionswert in `currency`. Nicht offengelegt heisst null. */
    deal_value: z.number().nonnegative().nullable(),
    currency: currencyCodeSchema.nullable(),
    /** Uebernommener Anteil in Prozent. */
    ownership_percentage: percentageSchema.nullable(),
    ...provenanceFields,
  })
  .strict()
  .refine(
    (deal) => deal.deal_value === null || deal.currency !== null,
    'Ein Transaktionswert ohne Waehrung ist keine Zahl, sondern eine Ziffernfolge',
  )
  .refine(
    (deal) =>
      deal.announcement_date === null ||
      deal.completion_date === null ||
      deal.completion_date >= deal.announcement_date,
    'Vollzug kann nicht vor der Ankuendigung liegen',
  )
  .refine(
    (deal) => deal.target_company_id !== deal.buyer_company_id,
    'Ein Unternehmen kann sich nicht selbst uebernehmen',
  );

// ── Ownership ────────────────────────────────────────────────────────────────

export const ownershipSchema = z
  .object({
    id: ownershipIdSchema,
    owner_id: companyIdSchema,
    owned_id: companyIdSchema,
    ownership_percentage: percentageSchema.nullable(),
    relationship_type: z.enum(OWNERSHIP_RELATIONSHIP_TYPES),
    valid_from: isoDateSchema.nullable(),
    /** null heisst "gilt weiterhin", nicht "unbekannt wann es endete". */
    valid_to: isoDateSchema.nullable(),
    ...provenanceFields,
  })
  .strict()
  .refine((ownership) => ownership.owner_id !== ownership.owned_id, 'Ein Unternehmen besitzt sich nicht selbst')
  .refine(
    (ownership) =>
      ownership.valid_from === null || ownership.valid_to === null || ownership.valid_to >= ownership.valid_from,
    'Gueltigkeitsende kann nicht vor dem Beginn liegen',
  );

// ── Asset ────────────────────────────────────────────────────────────────────

export const assetSchema = z
  .object({
    id: assetIdSchema,
    name: nonEmptyStringSchema,
    asset_type: z.enum(ASSET_TYPES),
    /** Wer den Standort betreibt — nicht zwingend der Eigentuemer. */
    operator_id: companyIdSchema.nullable(),
    owner_id: companyIdSchema.nullable(),
    country: countryCodeSchema,
    region: nonEmptyStringSchema.nullable(),
    latitude: latitudeSchema.nullable(),
    longitude: longitudeSchema.nullable(),
    operational_status: z.enum(ASSET_OPERATIONAL_STATUSES),
    /** Ein Standort kann mehrere Rohstoffe produzieren oder verarbeiten. */
    commodity_ids: z.array(commodityIdSchema),
    ...provenanceFields,
  })
  .strict()
  .refine(
    (asset) => (asset.latitude === null) === (asset.longitude === null),
    'Breiten- und Laengengrad muessen beide gesetzt oder beide null sein',
  );

// ── Commodity ────────────────────────────────────────────────────────────────

export const commoditySchema = z
  .object({
    id: commodityIdSchema,
    name: nonEmptyStringSchema,
    name_de: nonEmptyStringSchema,
    /** Elementsymbol, sofern es eines gibt ("Cu"). */
    symbol: z.string().regex(/^[A-Z][a-z]?$/, 'Elementsymbol wie "Cu"').nullable(),
    category: z.enum(COMMODITY_CATEGORIES),
    aliases: z.array(nonEmptyStringSchema),
    /** Auf der EU-Liste kritischer Rohstoffe gefuehrt. null = nicht geprueft. */
    eu_critical_raw_material: z.boolean().nullable(),
  })
  .strict();

// ── Source ───────────────────────────────────────────────────────────────────

export const sourceSchema = z
  .object({
    id: sourceIdSchema,
    /** null nur bei Quellen ohne Webadresse (Printausgabe, Papierauszug). */
    url: urlSchema.nullable(),
    publisher: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
    publication_date: isoDateSchema.nullable(),
    accessed_at: isoDateTimeSchema,
    source_type: z.enum(SOURCE_TYPES),
    /**
     * Zuverlaessigkeit dieser konkreten Quelle, 0–100. Der Quellentyp liefert
     * den Ausgangswert (`confidence.ts`); dieses Feld erlaubt, eine einzelne
     * Quelle davon abweichend zu bewerten.
     */
    reliability_score: confidenceSchema,
    /** Sprache nach ISO 639-1. */
    language: z.string().regex(/^[a-z]{2}$/, 'Sprachcode nach ISO 639-1, z. B. "de"').nullable(),
    /** Archivlink, damit ein toter Original-Link die Quelle nicht entwertet. */
    archive_url: urlSchema.nullable(),
  })
  .strict();

// ── Event ────────────────────────────────────────────────────────────────────

export const eventSchema = z
  .object({
    id: eventIdSchema,
    event_type: z.enum(EVENT_TYPES),
    date: isoDateSchema,
    headline: nonEmptyStringSchema,
    description: nonEmptyStringSchema.nullable(),
    company_ids: z.array(companyIdSchema),
    asset_ids: z.array(assetIdSchema),
    deal_ids: z.array(dealIdSchema),
    ...provenanceFields,
  })
  .strict();

// ── Datenbank ────────────────────────────────────────────────────────────────

/**
 * Der vollstaendige Datenbestand in einer Struktur. Fuer die erwarteten
 * Groessenordnungen der Phase 1 (Hunderte bis Zehntausende Datensaetze) passt er
 * in den Speicher; wann er das nicht mehr tut und was dann kommt, steht in
 * docs/decisions.md #2.
 */
export const intelligenceDatabaseSchema = z
  .object({
    companies: z.array(companySchema),
    deals: z.array(dealSchema),
    ownerships: z.array(ownershipSchema),
    assets: z.array(assetSchema),
    commodities: z.array(commoditySchema),
    sources: z.array(sourceSchema),
    events: z.array(eventSchema),
  })
  .strict();
