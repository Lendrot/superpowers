/**
 * Wiederverwendete Feldtypen.
 *
 * Zwei Konventionen gelten im ganzen Datenmodell:
 *
 * 1. Felder heissen `snake_case` — genau so, wie sie in den JSON-Dateien und in
 *    den GPT-Rechercheergebnissen stehen. Damit gibt es keine Uebersetzungs-
 *    schicht zwischen Austauschformat und Modell (siehe docs/decisions.md #4).
 * 2. Unbekanntes ist `null` und nicht "weggelassen". Ein fehlender Schluessel
 *    laesst offen, ob niemand nachgesehen hat; ein `null` ist die ausdrueckliche
 *    Aussage "nicht bekannt". Geschaetzt wird nie.
 */

import { z } from 'zod';

/** ISO-8601-Datum ohne Zeitanteil, z. B. "2025-03-14". */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum muss im Format YYYY-MM-DD vorliegen')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Datum existiert nicht im Kalender');

/** ISO-8601-Zeitpunkt in UTC, z. B. "2025-03-14T09:00:00.000Z". */
export const isoDateTimeSchema = z
  .string()
  .refine((value) => {
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime()) && value.endsWith('Z');
  }, 'Zeitpunkt muss ein ISO-8601-Zeitstempel in UTC sein (Endung Z)');

/** ISO 3166-1 alpha-2, Grossbuchstaben. Phase 1 arbeitet mit "DE". */
export const countryCodeSchema = z
  .string()
  .regex(/^[A-Z]{2}$/, 'Laendercode muss ISO 3166-1 alpha-2 sein, z. B. "DE"');

/** ISO 4217, Grossbuchstaben. */
export const currencyCodeSchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'Waehrung muss ISO 4217 sein, z. B. "EUR"');

export const latitudeSchema = z.number().min(-90).max(90);
export const longitudeSchema = z.number().min(-180).max(180);

/**
 * Konfidenz von 0 bis 100. Die Baender stehen in `confidence.ts`; hier ist nur
 * der Wertebereich festgelegt.
 */
export const confidenceSchema = z.number().int().min(0).max(100);

/** Prozentangaben von Beteiligungen: 0 bis 100, eine Nachkommastelle genuegt. */
export const percentageSchema = z
  .number()
  .min(0)
  .max(100)
  .refine((value) => Number.isFinite(value), 'Prozentwert muss endlich sein');

export const urlSchema = z
  .string()
  .url('Muss eine absolute URL sein')
  .refine((value) => value.startsWith('http://') || value.startsWith('https://'), 'Nur http(s)-URLs');

/** Nicht-leerer, getrimmter Text. Leerstrings sind keine Werte, sondern Luecken. */
export const nonEmptyStringSchema = z
  .string()
  .trim()
  .min(1, 'Darf nicht leer sein — fehlende Werte werden als null erfasst');
