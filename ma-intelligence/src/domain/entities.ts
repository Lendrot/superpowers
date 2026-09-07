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
import type {
  AssetId,
  ClaimId,
  CommodityId,
  CompanyId,
  DealId,
  EventId,
  IdPrefix,
  OwnershipId,
  SourceId,
} from './ids.js';
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
  CLAIM_SUBJECT_TYPES,
  COMMODITY_CATEGORIES,
  COMMODITY_ROLES,
  COMPANY_STATUSES,
  COORDINATE_ACCURACIES,
  DEAL_STATUSES,
  DEAL_TYPES,
  ENTITY_TYPES,
  EVENT_TYPES,
  EVIDENCE_STATUSES,
  INDUSTRIES,
  OWNERSHIP_RELATIONSHIP_TYPES,
  SOURCE_TYPES,
  TRANSACTION_STRUCTURES,
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
export const claimIdSchema = idSchema<'claim', ClaimId>('claim');

/** Beteiligungen und Belege koennen sich auf Gesellschaften oder Standorte beziehen. */
export const ownableIdSchema = z.union([companyIdSchema, assetIdSchema]);

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
    /** Wie genau die Koordinate ist — Gebaeude, Ortsmittelpunkt oder unbekannt. */
    coordinate_accuracy: z.enum(COORDINATE_ACCURACIES),
    /**
     * Woher die Koordinate stammt. Ohne Beleg gibt es keine Koordinate — die
     * Regel steht im Schema, nicht nur in der Dokumentation.
     */
    coordinate_source_url: urlSchema.nullable(),
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
  )
  .refine(
    (company) => company.latitude !== null || company.coordinate_accuracy === 'unknown',
    'Ohne Koordinate gibt es keine Genauigkeit',
  )
  .refine(
    (company) => company.latitude === null || company.coordinate_source_url !== null,
    'Eine Koordinate ohne belegte Quelle gibt es nicht',
  );

// ── Deal ─────────────────────────────────────────────────────────────────────

/**
 * Eine Partei auf einer Seite des Deals.
 *
 * Entweder ein modellierter Knoten (`company_id`) oder ein Name, der noch
 * keiner ist ("Familie Mustermann", "Streubesitz"). Beides zugleich ist
 * erlaubt, keines von beidem nicht — eine Partei ohne Identitaet ist keine
 * Angabe, sondern eine Luecke.
 */
export const dealPartySchema = z
  .object({
    company_id: companyIdSchema.nullable(),
    name: nonEmptyStringSchema.nullable(),
    /** Anteil dieser Partei am Konsortium in Prozent, sofern bekannt. */
    share_percentage: percentageSchema.nullable(),
  })
  .strict()
  .refine(
    (party) => party.company_id !== null || party.name !== null,
    'Eine Partei braucht eine company_id oder einen Namen',
  );

export const dealSchema = z
  .object({
    id: dealIdSchema,
    target_company_id: companyIdSchema,
    /**
     * Kaeuferseite. Ein Konsortium sind mehrere Eintraege; ein noch unbekannter
     * Kaeufer ist eine leere Liste — nicht ein erfundener Platzhalter.
     */
    buyers: z.array(dealPartySchema),
    /** Verkaeuferseite. Leer heisst unbekannt oder (bei einer Fusion) keine. */
    sellers: z.array(dealPartySchema),
    /** Wirtschaftliche Form. */
    deal_type: z.enum(DEAL_TYPES),
    /** Rechtliche Umsetzung — eigene Achse, damit ein Carve-out beides sein kann. */
    transaction_structure: z.enum(TRANSACTION_STRUCTURES),
    status: z.enum(DEAL_STATUSES),
    announcement_date: isoDateSchema.nullable(),
    completion_date: isoDateSchema.nullable(),
    /** Transaktionswert in `currency`. Nicht offengelegt heisst null. */
    deal_value: z.number().nonnegative().nullable(),
    currency: currencyCodeSchema.nullable(),
    /** Anteil, der mit diesem Deal uebergeht. */
    stake_acquired_percentage: percentageSchema.nullable(),
    /** Anteil der Kaeuferseite vorher — bei einer Beteiligungserhoehung > 0. */
    stake_before_percentage: percentageSchema.nullable(),
    /** Anteil der Kaeuferseite nach Vollzug. */
    stake_after_percentage: percentageSchema.nullable(),
    /** Bei einem Asset-Deal die Standorte, die uebergehen. */
    asset_ids: z.array(assetIdSchema),
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
    (deal) => !deal.buyers.some((party) => party.company_id === deal.target_company_id),
    'Ein Unternehmen kann sich nicht selbst uebernehmen',
  )
  .refine(
    (deal) =>
      deal.stake_before_percentage === null ||
      deal.stake_after_percentage === null ||
      deal.stake_after_percentage >= deal.stake_before_percentage,
    'Der Anteil nach dem Deal kann nicht kleiner sein als davor',
  )
  .refine((deal) => {
    // Vorher + erworben = nachher. Toleranz, weil Quellen runden.
    const { stake_before_percentage: before, stake_acquired_percentage: acquired } = deal;
    const after = deal.stake_after_percentage;
    if (before === null || acquired === null || after === null) return true;
    return Math.abs(before + acquired - after) <= 0.05;
  }, 'Anteil vorher plus erworbener Anteil muss den Anteil nachher ergeben')
  .refine(
    (deal) => deal.transaction_structure !== 'asset_deal' || deal.asset_ids.length > 0 || deal.status === 'rumored',
    'Ein Asset-Deal benennt die Standorte, die uebergehen — ausser er ist erst ein Geruecht',
  );

// ── Ownership ────────────────────────────────────────────────────────────────

export const ownershipSchema = z
  .object({
    id: ownershipIdSchema,
    owner_id: companyIdSchema,
    /** Gesellschaft oder Standort — ein Werk hat Eigentuemer wie eine Firma. */
    owned_id: ownableIdSchema,
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
      ownership.owned_id.startsWith('asset_')
        ? ['asset_owner', 'joint_venture', 'unknown'].includes(ownership.relationship_type)
        : ownership.relationship_type !== 'asset_owner',
    'relationship_type passt nicht zum Typ des besessenen Objekts',
  )
  .refine(
    (ownership) =>
      ownership.valid_from === null || ownership.valid_to === null || ownership.valid_to >= ownership.valid_from,
    'Gueltigkeitsende kann nicht vor dem Beginn liegen',
  );

// ── Asset ────────────────────────────────────────────────────────────────────

export const assetCommoditySchema = z
  .object({
    commodity_id: commodityIdSchema,
    role: z.enum(COMMODITY_ROLES),
  })
  .strict();

export const assetSchema = z
  .object({
    id: assetIdSchema,
    name: nonEmptyStringSchema,
    asset_type: z.enum(ASSET_TYPES),
    /**
     * Wer den Standort betreibt. Eigentum wird NICHT hier gefuehrt, sondern als
     * `Ownership` mit `owned_id` auf diesen Standort — sonst haette ein Werk
     * genau einen Eigentuemer und keine Historie.
     */
    operator_id: companyIdSchema.nullable(),
    country: countryCodeSchema,
    region: nonEmptyStringSchema.nullable(),
    latitude: latitudeSchema.nullable(),
    longitude: longitudeSchema.nullable(),
    coordinate_accuracy: z.enum(COORDINATE_ACCURACIES),
    operational_status: z.enum(ASSET_OPERATIONAL_STATUSES),
    /**
     * Was der Standort produziert oder verarbeitet, mit Haupt-/Nebenprodukt.
     * Kupfer als Hauptprodukt und Gold als Beiprodukt sind zwei Eintraege.
     */
    commodities: z.array(assetCommoditySchema),
    ...provenanceFields,
  })
  .strict()
  .refine(
    (asset) => (asset.latitude === null) === (asset.longitude === null),
    'Breiten- und Laengengrad muessen beide gesetzt oder beide null sein',
  )
  .refine(
    (asset) => asset.latitude !== null || asset.coordinate_accuracy === 'unknown',
    'Ohne Koordinate gibt es keine Genauigkeit',
  )
  .refine((asset) => {
    const ids = asset.commodities.map((entry) => entry.commodity_id);
    return new Set(ids).size === ids.length;
  }, 'Ein Rohstoff steht hoechstens einmal je Standort');

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

/**
 * Ein datiertes Ereignis, das auf Datensaetze zeigt — nicht deren Inhalt.
 *
 * Die Abgrenzung zum Deal ist strikt und der Grund, warum `Event` keine
 * Transaktionsfelder hat: **der Deal ist die Wahrheit ueber die Transaktion**
 * (Status, Daten, Wert, Anteile), das Event ist die Wahrheit darueber, dass am
 * Tag X etwas gemeldet wurde. Wer den Kaufpreis aus einem Event lesen will,
 * liest ihn am Deal. Ein Ereignis vom Typ `deal_*` muss deshalb den Deal
 * benennen, auf den es sich bezieht.
 */
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
  .strict()
  .refine(
    (event) => !event.event_type.startsWith('deal_') || event.deal_ids.length > 0,
    'Ein Deal-Ereignis muss den Deal benennen, auf den es sich bezieht — sonst entsteht eine zweite Wahrheit ueber dieselbe Transaktion',
  );

// ── Claim ────────────────────────────────────────────────────────────────────

/**
 * Ein Beleg fuer **eine einzelne Aussage**.
 *
 * `source_ids` an einem Datensatz sagt, welche Quellen ihn insgesamt tragen.
 * Das genuegt fuer den einfachen Fall und nicht fuer den wichtigen: welche
 * Quelle belegt, dass X 35 % an Y haelt? Genau dafuer ist ein Claim da —
 * Subjekt, betroffenes Feld, Quelle, in einem Satz.
 *
 * Bewusst KEIN Knowledge-Graph: ein Claim erfindet keine eigene Beziehung,
 * sondern zeigt auf einen bestehenden Datensatz und eines seiner Felder. Die
 * Beziehung selbst steht weiterhin dort, wo sie hingehoert.
 */
export const claimSchema = z
  .object({
    id: claimIdSchema,
    subject_type: z.enum(CLAIM_SUBJECT_TYPES),
    subject_id: anyIdSchema,
    /**
     * Das belegte Feld, z. B. "ownership_percentage" oder "announcement_date".
     * `null` belegt den Datensatz als Ganzes ("dieses Unternehmen existiert").
     */
    field: nonEmptyStringSchema.nullable(),
    /** Die Aussage im Klartext: "Beispiel Chemie haelt 35 % an Musterwerke." */
    statement: z.string().trim().min(10, 'Die Aussage muss lesbar sein'),
    source_id: sourceIdSchema,
    evidence: evidenceStatusSchema,
    confidence: confidenceSchema,
    created_at: isoDateTimeSchema,
  })
  .strict()
  .refine(
    (claim) => claim.subject_id.startsWith(`${claim.subject_type}_`),
    'subject_id muss zum subject_type passen',
  );

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
    /** Feingranulare Belege. Leer heisst: nur Belege auf Datensatzebene. */
    claims: z.array(claimSchema),
  })
  .strict();
