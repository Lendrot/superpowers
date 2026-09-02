import { describe, expect, it } from 'vitest';

import { canonicalJson, hashString, hashValue } from '@/engine/core/hash.js';

describe('canonicalJson', () => {
  it('ist unabhaengig von der Schluesselreihenfolge', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('sortiert auch verschachtelte Objekte', () => {
    const left = { outer: { z: [1, { y: 1, x: 2 }], a: true } };
    const right = { outer: { a: true, z: [1, { x: 2, y: 1 }] } };
    expect(canonicalJson(left)).toBe(canonicalJson(right));
  });

  it('laesst undefined in Objekten weg und macht es in Arrays zu null', () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalJson([undefined, 1])).toBe('[null,1]');
  });

  it('macht -0 und 0 ununterscheidbar', () => {
    expect(canonicalJson(-0)).toBe(canonicalJson(0));
  });

  it('wirft bei NaN und Infinity', () => {
    // Ein NaN im Log waere ein stiller Determinismusbruch: NaN !== NaN.
    expect(() => canonicalJson(Number.NaN)).toThrow(TypeError);
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});

describe('hash', () => {
  it('ist stabil ueber Laeufe hinweg', () => {
    // Festgenagelt: aendert sich dieser Wert, aendert sich jeder Golden-Hash.
    expect(hashString('ai-battle-royale')).toBe('0c9cdb6d86ed58c6');
    expect(hashValue({ a: 1, b: [2, 3] })).toBe(hashValue({ b: [2, 3], a: 1 }));
  });

  it('unterscheidet aehnliche Eingaben', () => {
    expect(hashString('agent_001')).not.toBe(hashString('agent_002'));
    expect(hashValue({ a: 1 })).not.toBe(hashValue({ a: 2 }));
  });

  it('ist reihenfolgeempfindlich', () => {
    expect(hashValue([1, 2])).not.toBe(hashValue([2, 1]));
  });
});
