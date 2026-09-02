/**
 * T03 — Seeded PRNG mit benannten Streams.
 *
 * Die Eigenschaft, auf die es ankommt (Doc 13 §7): **ein neuer Stream verschiebt
 * bestehende Folgen nicht.** Ein einziger globaler Generator hat diese
 * Eigenschaft nicht — wer irgendwo im Code einen Wuerfel dazwischenschiebt,
 * verschiebt alles Spaetere und macht jeden Golden-Hash wertlos.
 *
 * Deshalb: jeder Stream hat einen Namen, aus `(seed, name)` wird ein eigener
 * Startwert abgeleitet, und jeder Stream zaehlt fuer sich. Streams sind
 * counterbasiert (`wert_i = mix(startwert + i·GOLDEN)`), nicht zustandskettend —
 * dadurch ist der gesamte Zustand eines Streams eine einzige Zahl und
 * `rngState` bleibt serialisierbar (Doc 03 §3.1).
 *
 * Zwei Benutzungsarten:
 *
 * - `bundle.stream('world')` — langlebiger Stream. Sein Zaehler steht in
 *   `rngState` und gehoert damit in jeden Snapshot.
 * - `bundle.derive('gather', round, agentId)` — kurzlebiger Stream fuer genau
 *   eine Runde/einen Agenten. Der Schluessel enthaelt die Runde, also ist die
 *   Folge auch ohne gespeicherten Zaehler reproduzierbar. Ohne diese Variante
 *   waechst `rngState` linear mit Runden × Agenten.
 */

import { hashStringToUint32 } from './hash.js';
import type { RngStateBundle } from './types.js';

/** Fraktionaler Anteil von 2^32/φ — die uebliche Schrittweite fuer Counter-PRNGs. */
const GOLDEN_GAMMA = 0x9e3779b9;
const UINT32 = 0x1_0000_0000;

export type RngStreamPart = string | number;

export interface Rng {
  /** Vollstaendiger Streamname, z. B. `gather:7:agent_003` */
  readonly key: string;
  /** Zahl der bisher gezogenen Werte */
  readonly draws: number;
  /** naechster 32-Bit-Wert */
  next(): number;
  /** naechster Wert in [0, 1) */
  float(): number;
  /** ganze Zahl in [min, max], beide Grenzen einschliesslich */
  int(min: number, max: number): number;
  /** true mit Wahrscheinlichkeit `probability` */
  bool(probability: number): boolean;
  /** ein Element aus einer nicht-leeren Liste */
  pick<T>(items: readonly T[]): T;
  /** Fisher-Yates auf einer Kopie — die Eingabe bleibt unveraendert */
  shuffle<T>(items: readonly T[]): T[];
}

class CounterRng implements Rng {
  constructor(
    readonly key: string,
    private readonly streamSeed: number,
    private counter: number,
    private readonly onAdvance?: (key: string, counter: number) => void,
  ) {}

  get draws(): number {
    return this.counter;
  }

  next(): number {
    const value = mix32((this.streamSeed + Math.imul(this.counter, GOLDEN_GAMMA)) >>> 0);
    this.counter += 1;
    this.onAdvance?.(this.key, this.counter);
    return value;
  }

  float(): number {
    return this.next() / UINT32;
  }

  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new TypeError(`rng.int erwartet ganze Zahlen, bekam (${min}, ${max})`);
    }
    if (max < min) {
      throw new RangeError(`rng.int: leeres Intervall [${min}, ${max}]`);
    }
    const span = max - min + 1;
    return min + Math.floor(this.float() * span);
  }

  bool(probability: number): boolean {
    return this.float() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new RangeError('rng.pick: leere Liste');
    }
    const item = items[this.int(0, items.length - 1)];
    // items.length > 0 und der Index liegt im Intervall — der Cast ist hier
    // nur noetig, weil noUncheckedIndexedAccess das nicht beweisen kann.
    return item as T;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i);
      const a = copy[i] as T;
      const b = copy[j] as T;
      copy[i] = b;
      copy[j] = a;
    }
    return copy;
  }
}

export interface RngBundle {
  readonly seed: number;
  /**
   * Langlebiger Stream. Zaehlerstand wird im Bundle gefuehrt und landet ueber
   * `snapshot()` im WorldState.
   */
  stream(name: string, ...parts: RngStreamPart[]): Rng;
  /**
   * Kurzlebiger Stream. Zaehler wird NICHT gefuehrt — der Schluessel muss
   * deshalb alles enthalten, was den Aufruf eindeutig macht (typischerweise die
   * Runde und die AgentId).
   */
  derive(name: string, ...parts: RngStreamPart[]): Rng;
  /** Zaehlerstaende aller langlebigen Streams (fuer Snapshot/Resume). */
  snapshot(): RngStateBundle;
}

class Bundle implements RngBundle {
  private readonly counters = new Map<string, number>();

  constructor(
    readonly seed: number,
    initial: RngStateBundle,
  ) {
    for (const [key, counter] of Object.entries(initial)) {
      this.counters.set(key, counter);
    }
  }

  stream(name: string, ...parts: RngStreamPart[]): Rng {
    const key = streamKey(name, parts);
    return new CounterRng(key, this.streamSeed(key), this.counters.get(key) ?? 0, (k, counter) => {
      this.counters.set(k, counter);
    });
  }

  derive(name: string, ...parts: RngStreamPart[]): Rng {
    const key = streamKey(name, parts);
    return new CounterRng(key, this.streamSeed(key), 0);
  }

  snapshot(): RngStateBundle {
    const out: RngStateBundle = {};
    for (const key of [...this.counters.keys()].sort()) {
      out[key] = this.counters.get(key) ?? 0;
    }
    return out;
  }

  private streamSeed(key: string): number {
    return hashStringToUint32(`${this.seed}|${key}`);
  }
}

export function createRngBundle(seed: number, initial: RngStateBundle = {}): RngBundle {
  if (!Number.isInteger(seed)) {
    throw new TypeError(`Seed muss eine ganze Zahl sein, war ${seed}`);
  }
  return new Bundle(seed, initial);
}

export function streamKey(name: string, parts: readonly RngStreamPart[]): string {
  if (name.includes(':')) {
    throw new TypeError(`Streamname darf kein ':' enthalten: ${name}`);
  }
  return parts.length === 0 ? name : `${name}:${parts.join(':')}`;
}

/** murmur-artige Finalisierung; streut auch benachbarte Eingaben weit auseinander. */
function mix32(input: number): number {
  let x = input >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97) >>> 0;
  return (x ^ (x >>> 15)) >>> 0;
}
