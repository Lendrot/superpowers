/**
 * Stabiles Hashing ohne Abhaengigkeiten.
 *
 * "Stabil" heisst hier: derselbe Wert ergibt denselben Hash — in diesem Prozess,
 * im naechsten Prozess und auf einer anderen Maschine. Deshalb kanonische
 * Serialisierung (sortierte Schluessel) statt `JSON.stringify` mit
 * Einfuegereihenfolge, und deshalb eine eigene Implementierung statt `node:crypto`
 * (Doc 02 §2.1 Regel 2: die Engine haengt an nichts).
 */

/**
 * JSON mit deterministischer Schluesselreihenfolge.
 *
 * `undefined` wird in Objekten weggelassen (wie `JSON.stringify`), in Arrays zu
 * `null`. Nicht-endliche Zahlen werfen: ein `NaN` im Event-Log waere ein stiller
 * Determinismus-Bruch, weil `NaN !== NaN`.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) {
        throw new TypeError(`canonicalJson: nicht-endliche Zahl (${String(value)})`);
      }
      // -0 und 0 muessen denselben Text ergeben, sonst haengt der Hash am Vorzeichen.
      return Object.is(value, -0) ? '0' : String(value);
    case 'undefined':
      return 'null';
    case 'object':
      break;
    default:
      throw new TypeError(`canonicalJson: nicht serialisierbarer Typ ${typeof value}`);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of Object.keys(record).sort()) {
    const entry = record[key];
    if (entry === undefined) continue;
    parts.push(`${JSON.stringify(key)}:${canonicalJson(entry)}`);
  }
  return `{${parts.join(',')}}`;
}

const FNV_OFFSET_A = 0x811c9dc5;
const FNV_OFFSET_B = 0x9dc5811c;
const FNV_PRIME = 0x01000193;

/**
 * Zwei unabhaengige FNV-1a-Bahnen ueber UTF-16-Codeunits, zu 64 Bit Hex
 * zusammengesetzt. Kein Kryptohash — der Zweck ist, eine unbeabsichtigte
 * Verhaltensaenderung sichtbar zu machen, nicht Kollisionen abzuwehren.
 */
export class RollingHash {
  private laneA = FNV_OFFSET_A;
  private laneB = FNV_OFFSET_B;

  update(text: string): this {
    let a = this.laneA;
    let b = this.laneB;
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      a = Math.imul(a ^ code, FNV_PRIME) >>> 0;
      b = Math.imul(b ^ (code + i), FNV_PRIME) >>> 0;
    }
    this.laneA = a;
    this.laneB = b;
    return this;
  }

  digest(): string {
    return toHex8(this.laneA) + toHex8(this.laneB);
  }
}

/** Einmal-Hash eines Strings. */
export function hashString(text: string): string {
  return new RollingHash().update(text).digest();
}

/** Einmal-Hash eines beliebigen JSON-faehigen Werts (kanonisch serialisiert). */
export function hashValue(value: unknown): string {
  return hashString(canonicalJson(value));
}

/** 32-Bit-Streuwert eines Strings — Grundlage der RNG-Stream-Ableitung. */
export function hashStringToUint32(text: string): number {
  let h = FNV_OFFSET_A;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), FNV_PRIME) >>> 0;
  }
  // Abschliessende Durchmischung: FNV allein streut die oberen Bits schlecht.
  h ^= h >>> 16;
  h = Math.imul(h, 0x21f0aaad) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

function toHex8(value: number): string {
  return (value >>> 0).toString(16).padStart(8, '0');
}
