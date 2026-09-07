import { describe, expect, it } from 'vitest';

import { canonicalJson, hashValue, shortHash } from '@/domain/hash.js';

describe('canonicalJson', () => {
  it('ignoriert die Schluesselreihenfolge', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it('behaelt die Reihenfolge von Arrays bei', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it('wirft bei Werten, die kein JSON sind', () => {
    expect(() => canonicalJson({ a: Number.NaN })).toThrow(TypeError);
    expect(() => canonicalJson({ a: Number.POSITIVE_INFINITY })).toThrow(TypeError);
  });

  it('laesst undefined-Felder aus, statt sie zu null zu machen', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe('hashValue', () => {
  it('ist stabil und inhaltsabhaengig', () => {
    expect(hashValue({ a: 1 })).toBe(hashValue({ a: 1 }));
    expect(hashValue({ a: 1 })).not.toBe(hashValue({ a: 2 }));
  });

  it('kuerzt auf die gewuenschte Laenge', () => {
    expect(shortHash({ a: 1 }, 8)).toHaveLength(8);
    expect(hashValue({ a: 1 }).startsWith(shortHash({ a: 1 }, 8))).toBe(true);
    expect(() => shortHash({ a: 1 }, 2)).toThrow(RangeError);
  });
});
