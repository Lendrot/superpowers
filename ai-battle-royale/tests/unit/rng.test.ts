import { describe, expect, it } from 'vitest';

import { createRngBundle, streamKey } from '@/engine/core/rng.js';

function take(count: number, draw: () => number): number[] {
  return Array.from({ length: count }, () => draw());
}

describe('rng — gleicher Seed, gleiche Folge', () => {
  it('liefert bei gleichem Seed und gleichem Stream dieselbe Folge', () => {
    const a = createRngBundle(42).derive('gather', 1, 'agent_000');
    const b = createRngBundle(42).derive('gather', 1, 'agent_000');
    expect(take(20, () => a.next())).toEqual(take(20, () => b.next()));
  });

  it('liefert bei anderem Seed eine andere Folge', () => {
    const a = createRngBundle(42).derive('gather', 1, 'agent_000');
    const b = createRngBundle(43).derive('gather', 1, 'agent_000');
    expect(take(20, () => a.next())).not.toEqual(take(20, () => b.next()));
  });

  it('trennt Streams desselben Bundles', () => {
    const bundle = createRngBundle(42);
    const gather = bundle.derive('gather', 1, 'agent_000');
    const initiative = bundle.derive('initiative', 1, 'agent_000');
    expect(take(20, () => gather.next())).not.toEqual(take(20, () => initiative.next()));
  });

  it('trennt dieselbe Streamfamilie nach Runde und Agent', () => {
    const bundle = createRngBundle(42);
    const r1 = bundle.derive('gather', 1, 'agent_000');
    const r2 = bundle.derive('gather', 2, 'agent_000');
    const other = bundle.derive('gather', 1, 'agent_001');
    expect(take(10, () => r1.next())).not.toEqual(take(10, () => r2.next()));
    expect(take(10, () => r1.next())).not.toEqual(take(10, () => other.next()));
  });
});

describe('rng — ein neuer Stream verschiebt bestehende Folgen nicht', () => {
  it('haelt die Folge eines langlebigen Streams stabil, wenn dazwischen ein neuer entsteht', () => {
    // Referenzlauf: nur ein Stream.
    const reference = createRngBundle(7).stream('world');
    const expected = take(10, () => reference.next());

    // Zweiter Lauf: mittendrin wird ein voellig neuer Stream benutzt.
    const bundle = createRngBundle(7);
    const world = bundle.stream('world');
    const first = take(4, () => world.next());

    const intruder = bundle.stream('godEvents');
    take(50, () => intruder.next());

    const rest = take(6, () => bundle.stream('world').next());

    expect([...first, ...rest]).toEqual(expected);
  });

  it('haelt abgeleitete Streams unabhaengig von der Aufrufreihenfolge', () => {
    const bundle = createRngBundle(7);
    const direct = take(5, () => bundle.derive('choice', 3, 'agent_002').next());

    const shuffled = createRngBundle(7);
    take(9, () => shuffled.derive('choice', 3, 'agent_001').next());
    take(9, () => shuffled.derive('initiative', 3, 'agent_002').next());
    const afterNoise = take(5, () => shuffled.derive('choice', 3, 'agent_002').next());

    expect(afterNoise).toEqual(direct);
  });
});

describe('rng — Snapshot und Resume', () => {
  it('setzt einen langlebigen Stream aus dem Snapshot fort', () => {
    const original = createRngBundle(11);
    const stream = original.stream('world');
    take(5, () => stream.next());

    // Snapshot genau hier — er beschreibt den Stand nach fuenf Ziehungen.
    const snapshot = original.snapshot();
    const expected = take(5, () => stream.next());

    const resumed = createRngBundle(11, snapshot);
    expect(take(5, () => resumed.stream('world').next())).toEqual(expected);
  });

  it('fuehrt abgeleitete Streams nicht im Snapshot', () => {
    const bundle = createRngBundle(11);
    take(5, () => bundle.derive('gather', 1, 'agent_000').next());
    expect(bundle.snapshot()).toEqual({});
  });

  it('zaehlt Ziehungen langlebiger Streams im Snapshot mit', () => {
    const bundle = createRngBundle(11);
    take(3, () => bundle.stream('world').next());
    expect(bundle.snapshot()).toEqual({ world: 3 });
  });
});

describe('rng — Hilfsfunktionen', () => {
  it('haelt int() in den Grenzen, beide einschliesslich', () => {
    const rng = createRngBundle(3).derive('test');
    const values = take(2000, () => rng.int(1, 6));
    expect(Math.min(...values)).toBe(1);
    expect(Math.max(...values)).toBe(6);
    expect(values.every((v) => Number.isInteger(v))).toBe(true);
  });

  it('wirft bei leerem Intervall und bei leerer Liste', () => {
    const rng = createRngBundle(3).derive('test');
    expect(() => rng.int(5, 4)).toThrow(RangeError);
    expect(() => rng.pick([])).toThrow(RangeError);
  });

  it('shuffle ist eine Permutation und laesst die Eingabe unveraendert', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const rng = createRngBundle(3).derive('test');
    const out = rng.shuffle(input);
    expect(out).not.toBe(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });

  it('float() bleibt in [0, 1)', () => {
    const rng = createRngBundle(3).derive('test');
    const values = take(1000, () => rng.float());
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it('verbietet ein ":" im Streamnamen, weil es der Trenner der Schluessel ist', () => {
    expect(() => streamKey('a:b', [])).toThrow(TypeError);
  });
});
