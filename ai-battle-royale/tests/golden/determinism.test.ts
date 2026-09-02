import { describe, expect, it } from 'vitest';

import { resolveConfig } from '@/engine/core/config.js';
import { canonicalJson } from '@/engine/core/hash.js';
import { hashEvents } from '@/engine/core/eventLog.js';
import { runMatch } from '@/engine/runner/runMatch.js';
import { initWorld } from '@/engine/world/initWorld.js';

/**
 * Das Gate aus Doc 12, Tag 1.
 *
 * Erfolgskriterium Doc 01 §1.5.1: gleicher Seed und `llmMode: 'off'` ⇒
 * identischer Log-Hash. Bricht dieser Test, ist eine Verhaltensaenderung
 * eingetreten. War sie beabsichtigt, wird der Golden-Wert bewusst neu
 * geschrieben — und die Commit-Nachricht muss das benennen (Doc 10 §E).
 */

const GOLDEN = {
  /** Seed 42, 30 Agenten, 100 Runden — das Abnahmekriterium des ersten Schritts. */
  seed42x100: '81c32a17c816f6b4',
  /** Derselbe Lauf ueber 400 Runden. */
  seed42x400: '2b7b1d6c002d2e7b',
  /** Anderer Seed, damit ein konstanter Hash nicht als Determinismus durchgeht. */
  seed7x100: 'a251d5a14167f65a',
} as Record<string, string>;

function run(seed: number, rounds: number, agents = 30) {
  return runMatch(resolveConfig({ seed, agentCount: agents, maxRounds: rounds, llmMode: 'off' }));
}

describe('Determinismus — fuenf Laeufe, ein Hash', () => {
  it('liefert bei Seed 42 ueber 100 Runden fuenfmal denselben Log-Hash', () => {
    const hashes = Array.from({ length: 5 }, () => run(42, 100).logHash);
    expect(new Set(hashes).size).toBe(1);
  });

  it('liefert auch ueber 400 Runden fuenfmal denselben Log-Hash', () => {
    const hashes = Array.from({ length: 5 }, () => run(42, 400).logHash);
    expect(new Set(hashes).size).toBe(1);
  });

  it('erzeugt bei anderem Seed einen anderen Hash', () => {
    expect(run(42, 100).logHash).not.toBe(run(43, 100).logHash);
  });

  it('erzeugt bei anderer Agentenzahl einen anderen Hash', () => {
    expect(run(42, 100, 30).logHash).not.toBe(run(42, 100, 29).logHash);
  });
});

describe('Determinismus — der Lauf selbst, nicht nur sein Hash', () => {
  it('erzeugt zwei bitgleiche Event-Folgen', () => {
    const a = run(42, 100);
    const b = run(42, 100);
    expect(canonicalJson(a.log.events)).toBe(canonicalJson(b.log.events));
  });

  it('endet in einem bitgleichen Weltzustand', () => {
    expect(canonicalJson(run(42, 100).state)).toBe(canonicalJson(run(42, 100).state));
  });

  it('erzeugt eine bitgleiche Startwelt', () => {
    const config = resolveConfig({ seed: 42, agentCount: 30 });
    expect(canonicalJson(initWorld(config).state)).toBe(canonicalJson(initWorld(config).state));
  });

  it('rechnet denselben Hash aus der fertigen Event-Folge', () => {
    const result = run(42, 100);
    expect(hashEvents(result.state.matchId, result.log.events)).toBe(result.logHash);
  });
});

describe('Golden — festgenagelte Hashes', () => {
  it('Seed 42, 30 Agenten, 100 Runden', () => {
    expect(run(42, 100).logHash).toBe(GOLDEN['seed42x100']);
  });

  it('Seed 42, 30 Agenten, 400 Runden', () => {
    expect(run(42, 400).logHash).toBe(GOLDEN['seed42x400']);
  });

  it('Seed 7, 30 Agenten, 100 Runden', () => {
    expect(run(7, 100).logHash).toBe(GOLDEN['seed7x100']);
  });
});

describe('Golden — der Lauf ist nicht entartet', () => {
  // Ein Hash beweist Reproduzierbarkeit, nicht dass ueberhaupt etwas passiert.
  // Ohne diese Zusicherungen bliebe ein Lauf gruen, in dem 30 Agenten 400 Runden
  // lang nichts tun.
  const result = run(42, 400);

  it('faehrt alle Runden', () => {
    expect(result.rounds).toBe(400);
    expect(result.endReason).toBe('round_limit');
  });

  it('trifft in jeder Runde fuer jeden Agenten eine Entscheidung', () => {
    expect(result.decisions).toBe(400 * 30);
  });

  it('nutzt beide implementierten Aktionen', () => {
    expect(result.actionCounts['rest']).toBeGreaterThan(100);
    expect(result.actionCounts['gather_resource']).toBeGreaterThan(100);
  });

  it('haelt die Reject-Rate bei null', () => {
    expect(result.rejectRate).toBe(0);
  });

  it('erzeugt Ernten, die tatsaechlich ankommen', () => {
    expect(result.eventCounts['resource_gathered']).toBeGreaterThan(1000);
  });
});
