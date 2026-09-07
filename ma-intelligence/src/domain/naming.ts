/**
 * Namensnormalisierung — die Grundlage der Entity Resolution.
 *
 * "BASF SE", "BASF" und "BASF Group" sind dasselbe Unternehmen. Die
 * Zusammenfuehrung selbst passiert in der Import-Pipeline; hier steht nur der
 * reine, testbare Teil: ein Name wird auf eine Vergleichsform reduziert.
 *
 * Bewusst NICHT enthalten ist Fuzzy-Matching (Levenshtein o. ae.). Ein
 * unscharfer Treffer ist eine Behauptung, kein Fakt — solche Faelle gehoeren in
 * die Review Queue, nicht in eine Normalisierungsfunktion.
 */

/**
 * Rechtsformen und Zusaetze, die keine Identitaet stiften. Die Liste deckt
 * Deutschland (Phase 1) ab und enthaelt die haeufigsten europaeischen Formen,
 * weil Kaeufer schon in Phase 1 regelmaessig auslaendisch sind.
 */
export const LEGAL_FORM_TOKENS: readonly string[] = [
  // Deutschland
  'ag', 'se', 'gmbh', 'mbh', 'kg', 'kgaa', 'gmbh_co_kg', 'ohg', 'gbr', 'eg', 'ug',
  'ev', 'stiftung', 'holding', 'group', 'gruppe', 'konzern',
  // Oesterreich / Schweiz
  'ges_m_b_h', 'ag_co_kg',
  // Europa / international
  'nv', 'bv', 'plc', 'ltd', 'limited', 'llc', 'inc', 'corp', 'corporation',
  'sa', 'sas', 'sarl', 'spa', 'srl', 'ab', 'as', 'oy', 'aps', 'sp_z_oo', 'sro',
];

const LEGAL_FORM_SET = new Set(LEGAL_FORM_TOKENS);

const SPECIAL_CHARACTERS: Readonly<Record<string, string>> = {
  ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss',
  å: 'a', æ: 'ae', ø: 'oe', œ: 'oe',
  á: 'a', à: 'a', â: 'a', ã: 'a',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i',
  ó: 'o', ò: 'o', ô: 'o', õ: 'o',
  ú: 'u', ù: 'u', û: 'u',
  ç: 'c', ñ: 'n', ý: 'y', š: 's', ž: 'z', č: 'c', ř: 'r', ł: 'l',
  '&': ' und ',
  '+': ' und ',
};

/**
 * Kleinbuchstaben, ASCII, Unterstriche. Deutsche Umlaute werden transkribiert
 * (ä → ae), nicht entfernt — "Müller" und "Muller" sind verschiedene Namen,
 * "Müller" und "Mueller" sind derselbe.
 */
export function slugify(input: string): string {
  const lowered = input.toLowerCase();
  let replaced = '';
  for (const character of lowered) {
    replaced += SPECIAL_CHARACTERS[character] ?? character;
  }
  const ascii = replaced.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const slug = ascii.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (slug === '') {
    throw new RangeError(`slugify: "${input}" enthaelt kein verwertbares Zeichen`);
  }
  return slug;
}

/**
 * Vergleichsform eines Firmennamens: Slug ohne Rechtsform- und Holding-Tokens.
 *
 * Ein Name, der nur aus Rechtsformen besteht ("Holding GmbH"), behaelt seine
 * Tokens — sonst waere seine Vergleichsform leer und wuerde mit jeder anderen
 * leeren Form zusammenfallen.
 */
export function normalizeCompanyName(name: string): string {
  const tokens = slugify(name).split('_');
  const kept = tokens.filter((token) => !LEGAL_FORM_SET.has(token) && token !== 'co' && token !== '');
  return kept.length > 0 ? kept.join('_') : tokens.join('_');
}

/**
 * Hostname einer Website in Vergleichsform: ohne Schema, ohne "www.", ohne
 * Pfad, klein geschrieben. Domain-Gleichheit ist eines der staerksten Signale
 * dafuer, dass zwei Namen dasselbe Unternehmen meinen.
 */
export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === '') return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  let host: string;
  try {
    host = new URL(withScheme).hostname;
  } catch {
    return null;
  }
  const withoutWww = host.startsWith('www.') ? host.slice(4) : host;
  return withoutWww === '' ? null : withoutWww;
}
