/**
 * IDs.
 *
 * Zwei Anforderungen bestimmen die Form: Die Datenbank liegt als JSON in Git,
 * also muessen IDs im Diff lesbar sein ("company_basf_se" statt einer UUID).
 * Und sie muessen deterministisch aus dem Inhalt entstehen, damit derselbe
 * GPT-Datensatz zweimal importiert nicht zwei Datensaetze erzeugt.
 *
 * Eine ID ist ein Bezeichner, kein Fakt. Sie darf sich nur beim Anlegen
 * ergeben; ein spaeter korrigierter Firmenname aendert die ID NICHT, sonst
 * brechen alle Verweise darauf.
 */

import { shortHash } from './hash.js';
import { slugify } from './naming.js';

export type CompanyId = `company_${string}`;
export type DealId = `deal_${string}`;
export type OwnershipId = `ownership_${string}`;
export type AssetId = `asset_${string}`;
export type CommodityId = `commodity_${string}`;
export type SourceId = `source_${string}`;
export type EventId = `event_${string}`;

export type EntityId = CompanyId | DealId | OwnershipId | AssetId | CommodityId | SourceId | EventId;

export const ID_PREFIXES = [
  'company',
  'deal',
  'ownership',
  'asset',
  'commodity',
  'source',
  'event',
] as const;

export type IdPrefix = (typeof ID_PREFIXES)[number];

// Doppelte Unterstriche trennen die Bestandteile zusammengesetzter IDs
// (deal_<ziel>__<kaeufer>__<jahr>), einfache trennen Woerter innerhalb eines
// Bestandteils.
const SLUG_BODY = '[a-z0-9]+(?:_+[a-z0-9]+)*';

function idPattern(prefix: IdPrefix): RegExp {
  return new RegExp(`^${prefix}_${SLUG_BODY}$`);
}

export function isId<P extends IdPrefix>(prefix: P, value: unknown): value is `${P}_${string}` {
  return typeof value === 'string' && idPattern(prefix).test(value);
}

/** Prefix einer beliebigen ID — fuer generische Verweispruefungen. */
export function idPrefixOf(value: string): IdPrefix | null {
  for (const prefix of ID_PREFIXES) {
    if (idPattern(prefix).test(value)) return prefix;
  }
  return null;
}

function withDiscriminator(base: string, discriminator?: string): string {
  if (discriminator === undefined) return base;
  return `${base}_${slugify(discriminator)}`;
}

/**
 * `companyId('BASF SE')` → `company_basf_se`.
 *
 * Der Diskriminator ist fuer echte Namensgleichheit gedacht (zwei nicht
 * verwandte "Müller GmbH"), nicht fuer Schreibvarianten desselben
 * Unternehmens — die gehoeren in `aliases`, nicht in eine zweite ID.
 */
export function companyId(displayName: string, discriminator?: string): CompanyId {
  return `company_${withDiscriminator(slugify(displayName), discriminator)}`;
}

/**
 * Ein Deal wird ueber Ziel, Kaeufer und Ankuendigungsjahr identifiziert. Ist
 * der Kaeufer noch unbekannt (Statuts `rumored` oder `sale_process`), tritt
 * `unknown_buyer` an seine Stelle; wird er spaeter bekannt, bleibt die ID
 * bestehen und der Datensatz bekommt nur ein Feld dazu.
 */
export function dealId(input: {
  targetId: CompanyId;
  buyerId: CompanyId | null;
  year: number | null;
  discriminator?: string;
}): DealId {
  const target = input.targetId.slice('company_'.length);
  const buyer = input.buyerId === null ? 'unknown_buyer' : input.buyerId.slice('company_'.length);
  const year = input.year === null ? 'undated' : String(input.year);
  if (input.year !== null && (!Number.isInteger(input.year) || input.year < 1800 || input.year > 2200)) {
    throw new RangeError(`dealId: unplausibles Jahr ${input.year}`);
  }
  return `deal_${withDiscriminator(`${target}__${buyer}__${year}`, input.discriminator)}`;
}

/**
 * Eine Beteiligung ist erst durch ihren Gueltigkeitsbeginn eindeutig: derselbe
 * Eigentuemer kann denselben Anteil verkaufen und Jahre spaeter zurueckkaufen.
 */
export function ownershipId(input: {
  ownerId: CompanyId;
  ownedId: CompanyId;
  validFrom: string | null;
}): OwnershipId {
  const owner = input.ownerId.slice('company_'.length);
  const owned = input.ownedId.slice('company_'.length);
  const from = input.validFrom === null ? 'open' : slugify(input.validFrom);
  return `ownership_${owner}__${owned}__${from}`;
}

export function assetId(name: string, discriminator?: string): AssetId {
  return `asset_${withDiscriminator(slugify(name), discriminator)}`;
}

export function commodityId(name: string): CommodityId {
  return `commodity_${slugify(name)}`;
}

/**
 * Quellen werden ueber ihre URL identifiziert. Ohne URL (Printausgabe,
 * Handelsregisterauszug auf Papier) traegt der Hash Publisher, Titel und Datum
 * — zwei Erfassungen desselben Artikels ergeben dieselbe ID.
 */
export function sourceId(input: {
  url: string | null;
  publisher: string;
  title: string;
  publicationDate: string | null;
}): SourceId {
  const fingerprint =
    input.url !== null
      ? { url: input.url.trim().toLowerCase() }
      : {
          publisher: input.publisher.trim().toLowerCase(),
          title: input.title.trim().toLowerCase(),
          publicationDate: input.publicationDate,
        };
  return `source_${slugify(input.publisher)}_${shortHash(fingerprint)}`;
}

export function eventId(input: { date: string; headline: string }): EventId {
  const datePart = slugify(input.date);
  return `event_${datePart}_${shortHash({ headline: input.headline.trim().toLowerCase(), date: input.date })}`;
}
