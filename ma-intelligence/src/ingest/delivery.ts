/**
 * Das Lieferformat fuer recherchierte Datensaetze und seine Uebersetzung ins
 * Datenmodell.
 *
 * Eine Lieferung vergibt keine IDs. Sie verweist innerhalb der Datei ueber
 * `ref`-Schluessel aufeinander und nennt fuer Unternehmen nach Moeglichkeit eine
 * Wikidata-ID — daran haengt das Entity Matching gegen den vorhandenen
 * Marktatlas-Bestand, und daran haengen die Koordinaten. Erfunden wird nichts:
 * findet sich kein Standort, bleibt er null.
 */

import { z } from 'zod';

import { claimId, companyId, dealId, sourceId } from '../domain/ids.js';
import type { CompanyId, SourceId } from '../domain/ids.js';
import {
  confidenceSchema,
  countryCodeSchema,
  currencyCodeSchema,
  isoDateSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  percentageSchema,
  urlSchema,
} from '../domain/primitives.js';
import type { Claim, Company, Deal, IntelligenceDatabase, Source } from '../domain/types.js';
import {
  COMPANY_STATUSES,
  COORDINATE_ACCURACIES,
  DEAL_STATUSES,
  DEAL_TYPES,
  ENTITY_TYPES,
  EVIDENCE_STATUSES,
  INDUSTRIES,
  SOURCE_TYPES,
  TRANSACTION_STRUCTURES,
} from '../domain/vocabulary.js';

const refSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, 'ref ist ein kleingeschriebener Schluessel');

export const deliverySourceSchema = z
  .object({
    ref: refSchema,
    url: urlSchema.nullable(),
    publisher: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
    publication_date: isoDateSchema.nullable(),
    source_type: z.enum(SOURCE_TYPES),
    language: z.string().regex(/^[a-z]{2}$/).nullable(),
    reliability_score: confidenceSchema,
  })
  .strict();

export const deliveryCompanySchema = z
  .object({
    ref: refSchema,
    legal_name: nonEmptyStringSchema,
    display_name: nonEmptyStringSchema,
    aliases: z.array(nonEmptyStringSchema).default([]),
    former_names: z.array(nonEmptyStringSchema).default([]),
    entity_type: z.enum(ENTITY_TYPES),
    country: countryCodeSchema,
    /** Wikidata-ID — der Anker fuer Entity Matching und Koordinaten. */
    wikidata: z.string().regex(/^Q\d+$/).nullable(),
    /** Stadt fuer den Fall, dass es keine Wikidata-Koordinate gibt. */
    city: nonEmptyStringSchema.nullable(),
    region: nonEmptyStringSchema.nullable(),
    industry: z.enum(INDUSTRIES),
    subindustry: nonEmptyStringSchema.nullable(),
    website: urlSchema.nullable(),
    status: z.enum(COMPANY_STATUSES),
    source_refs: z.array(refSchema),
    confidence: confidenceSchema,
    evidence: z.enum(EVIDENCE_STATUSES),
    notes: nonEmptyStringSchema.nullable(),
  })
  .strict();

const deliveryPartySchema = z
  .object({
    company_ref: refSchema.nullable(),
    name: nonEmptyStringSchema.nullable(),
    share_percentage: percentageSchema.nullable(),
  })
  .strict()
  .refine((party) => party.company_ref !== null || party.name !== null, 'Partei braucht Referenz oder Namen');

export const deliveryDealSchema = z
  .object({
    ref: refSchema,
    target_ref: refSchema,
    buyers: z.array(deliveryPartySchema),
    sellers: z.array(deliveryPartySchema),
    deal_type: z.enum(DEAL_TYPES),
    transaction_structure: z.enum(TRANSACTION_STRUCTURES),
    status: z.enum(DEAL_STATUSES),
    announcement_date: isoDateSchema.nullable(),
    completion_date: isoDateSchema.nullable(),
    deal_value: z.number().nonnegative().nullable(),
    currency: currencyCodeSchema.nullable(),
    stake_acquired_percentage: percentageSchema.nullable(),
    stake_before_percentage: percentageSchema.nullable(),
    stake_after_percentage: percentageSchema.nullable(),
    source_refs: z.array(refSchema),
    confidence: confidenceSchema,
    evidence: z.enum(EVIDENCE_STATUSES),
    notes: nonEmptyStringSchema.nullable(),
  })
  .strict();

/** Ein Beleg fuer ein einzelnes Feld eines gelieferten Deals. */
export const deliveryClaimSchema = z
  .object({
    deal_ref: refSchema,
    field: nonEmptyStringSchema.nullable(),
    statement: z.string().trim().min(10),
    source_ref: refSchema,
    evidence: z.enum(EVIDENCE_STATUSES),
    confidence: confidenceSchema,
  })
  .strict();

export const deliverySchema = z
  .object({
    dataset_id: nonEmptyStringSchema,
    /** Recherchezeitpunkt; wird zum `accessed_at` der Quellen. */
    prepared_at: isoDateTimeSchema,
    scope: nonEmptyStringSchema,
    /** Wie geprueft die Lieferung ist — steht spaeter im Datensatz. */
    verification_note: nonEmptyStringSchema,
    sources: z.array(deliverySourceSchema),
    companies: z.array(deliveryCompanySchema),
    deals: z.array(deliveryDealSchema),
    claims: z.array(deliveryClaimSchema).default([]),
  })
  .strict();

export type Delivery = z.infer<typeof deliverySchema>;

/**
 * Koordinaten, die der Importer von aussen bekommt. Der Ingest-Layer liest
 * selbst keine Dateien — wer den Marktatlas-Snapshot laedt, ist die CLI.
 */
export interface CoordinateLookup {
  /** Standort zu einer Wikidata-ID, falls im Snapshot vorhanden. */
  byWikidata(id: string): GeoPoint | null;
  /** Ortsmittelpunkt zu einem Stadtnamen, falls belegt. */
  byCity(name: string): GeoPoint | null;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
  accuracy: (typeof COORDINATE_ACCURACIES)[number];
  /** Wikidata-Seite, aus der die Koordinate stammt. */
  source_url: string;
}

export class DeliveryReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeliveryReferenceError';
  }
}

export interface ImportResult {
  database: IntelligenceDatabase;
  /** Was der Importer nicht aufloesen konnte, ohne etwas zu erfinden. */
  unresolved: string[];
}

/**
 * Uebersetzt eine Lieferung in Datensaetze.
 *
 * `now` kommt herein, damit derselbe Import zweimal dasselbe Ergebnis liefert.
 */
export function importDelivery(delivery: Delivery, coordinates: CoordinateLookup, now: string): ImportResult {
  const unresolved: string[] = [];

  const sourceIds = new Map<string, SourceId>();
  const sources: Source[] = delivery.sources.map((entry) => {
    const id = sourceId({
      url: entry.url,
      publisher: entry.publisher,
      title: entry.title,
      publicationDate: entry.publication_date,
    });
    sourceIds.set(entry.ref, id);
    return {
      id,
      url: entry.url,
      publisher: entry.publisher,
      title: entry.title,
      publication_date: entry.publication_date,
      accessed_at: now,
      source_type: entry.source_type,
      reliability_score: entry.reliability_score,
      language: entry.language,
      archive_url: null,
    };
  });

  const resolveSources = (refs: readonly string[], context: string): SourceId[] =>
    refs.map((ref) => {
      const id = sourceIds.get(ref);
      if (id === undefined) throw new DeliveryReferenceError(`${context}: unbekannte Quelle "${ref}"`);
      return id;
    });

  const companyIds = new Map<string, CompanyId>();
  const companies: Company[] = delivery.companies.map((entry) => {
    const id = companyId(entry.display_name);
    companyIds.set(entry.ref, id);

    const point =
      (entry.wikidata !== null ? coordinates.byWikidata(entry.wikidata) : null) ??
      (entry.city !== null ? coordinates.byCity(entry.city) : null);

    if (point === null) {
      unresolved.push(`${entry.display_name}: kein belegter Standort — Koordinaten bleiben null`);
    }

    return {
      id,
      entity_type: entry.entity_type,
      legal_name: entry.legal_name,
      display_name: entry.display_name,
      former_names: entry.former_names,
      aliases: entry.aliases,
      country: entry.country,
      headquarters: {
        city: entry.city,
        region: entry.region,
        street_address: null,
        postal_code: null,
      },
      latitude: point?.latitude ?? null,
      longitude: point?.longitude ?? null,
      coordinate_accuracy: point?.accuracy ?? 'unknown',
      industry: entry.industry,
      subindustry: entry.subindustry,
      website: entry.website,
      status: entry.status,
      identifiers: {
        lei: null,
        handelsregister: null,
        vat_id: null,
        isin: null,
        wikidata: entry.wikidata,
        domains: entry.website === null ? [] : [new URL(entry.website).hostname.replace(/^www\./, '')],
      },
      source_ids: resolveSources(entry.source_refs, entry.display_name),
      confidence: entry.confidence,
      evidence: entry.evidence,
      notes: entry.notes,
      created_at: now,
      updated_at: now,
    };
  });

  const resolveCompany = (ref: string, context: string): CompanyId => {
    const id = companyIds.get(ref);
    if (id === undefined) throw new DeliveryReferenceError(`${context}: unbekanntes Unternehmen "${ref}"`);
    return id;
  };

  const dealIds = new Map<string, Deal['id']>();
  const deals: Deal[] = delivery.deals.map((entry) => {
    const targetId = resolveCompany(entry.target_ref, entry.ref);
    const buyers = entry.buyers.map((party) => ({
      company_id: party.company_ref === null ? null : resolveCompany(party.company_ref, entry.ref),
      name: party.name,
      share_percentage: party.share_percentage,
    }));
    const dateForId = entry.completion_date ?? entry.announcement_date;
    const id = dealId({
      targetId,
      buyerIds: buyers
        .map((party) => party.company_id)
        .filter((value): value is CompanyId => value !== null),
      year: dateForId === null ? null : Number(dateForId.slice(0, 4)),
    });
    dealIds.set(entry.ref, id);

    return {
      id,
      target_company_id: targetId,
      buyers,
      sellers: entry.sellers.map((party) => ({
        company_id: party.company_ref === null ? null : resolveCompany(party.company_ref, entry.ref),
        name: party.name,
        share_percentage: party.share_percentage,
      })),
      deal_type: entry.deal_type,
      transaction_structure: entry.transaction_structure,
      status: entry.status,
      announcement_date: entry.announcement_date,
      completion_date: entry.completion_date,
      deal_value: entry.deal_value,
      currency: entry.currency,
      stake_acquired_percentage: entry.stake_acquired_percentage,
      stake_before_percentage: entry.stake_before_percentage,
      stake_after_percentage: entry.stake_after_percentage,
      asset_ids: [],
      source_ids: resolveSources(entry.source_refs, entry.ref),
      confidence: entry.confidence,
      evidence: entry.evidence,
      notes: entry.notes,
      created_at: now,
      updated_at: now,
    };
  });

  const claims: Claim[] = delivery.claims.map((entry) => {
    const subjectId = dealIds.get(entry.deal_ref);
    if (subjectId === undefined) throw new DeliveryReferenceError(`Beleg: unbekannter Deal "${entry.deal_ref}"`);
    const source = sourceIds.get(entry.source_ref);
    if (source === undefined) throw new DeliveryReferenceError(`Beleg: unbekannte Quelle "${entry.source_ref}"`);
    return {
      id: claimId({ subjectId, field: entry.field, sourceId: source }),
      subject_type: 'deal',
      subject_id: subjectId,
      field: entry.field,
      statement: entry.statement,
      source_id: source,
      evidence: entry.evidence,
      confidence: entry.confidence,
      created_at: now,
    };
  });

  return {
    database: { companies, deals, ownerships: [], assets: [], commodities: [], sources, events: [], claims },
    unresolved,
  };
}
