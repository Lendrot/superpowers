/**
 * Stabile Fingerabdruecke.
 *
 * Zwei Aufgaben: der Hash-Anteil einer ID und der Dublettenabgleich in der
 * Import-Pipeline. Beide muessen ueber Prozessgrenzen und Laeufe hinweg
 * identisch bleiben, deshalb wird vor dem Hashen kanonisiert — die
 * Schluesselreihenfolge eines Objekts darf das Ergebnis nicht veraendern.
 */

import { createHash } from 'node:crypto';

/**
 * JSON mit sortierten Schluesseln. `undefined` und Funktionen sind hier ein
 * Fehler und keine stille Auslassung: ein Feld, das im Fingerabdruck fehlt,
 * macht zwei verschiedene Datensaetze gleich.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`canonicalJson: ${String(value)} ist nicht serialisierbar`);
    }
    return value;
  }
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const entry = source[key];
      if (entry === undefined) continue;
      result[key] = canonicalize(entry);
    }
    return result;
  }
  if (typeof value === 'undefined' || typeof value === 'function') {
    throw new TypeError(`canonicalJson: ${typeof value} ist nicht serialisierbar`);
  }
  return value;
}

/** Voller sha256-Hex-Hash ueber die kanonische Form. */
export function hashValue(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

/** Gekuerzter Hash fuer ID-Suffixe. Kollisionen sind bei den erwarteten
 *  Datenmengen (Zehntausende Datensaetze) praktisch ausgeschlossen; die
 *  aufrufende Stelle prueft trotzdem auf Eindeutigkeit. */
export function shortHash(value: unknown, length = 8): string {
  if (!Number.isInteger(length) || length < 4 || length > 64) {
    throw new RangeError(`shortHash: length muss zwischen 4 und 64 liegen, war ${length}`);
  }
  return hashValue(value).slice(0, length);
}
