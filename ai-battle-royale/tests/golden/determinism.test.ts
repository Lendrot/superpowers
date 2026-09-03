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

/**
 * Zuletzt neu geschrieben mit Tag 4 (T17-T19): `trade`, `share_information`,
 * `request_information` und das Beziehungssystem. Diesmal **echt** neues
 * Verhalten, nicht nur eine verschobene `MatchId`:
 *
 * - Kampf loest jetzt zusaetzlich `relationship`-Effekte aus (Phase 8,
 *   `world/relationships.ts`) — keine neuen Events, aber ein veraenderter
 *   World State ab der ersten Runde mit einem Treffer.
 * - Drei neue Aktionstypen stehen ab Runde 1 in jedem Kandidatensatz. Auch
 *   wenn sie bei den bestehenden Policy-Gewichten so gut wie nie gewinnen
 *   (siehe README, "Was noch offen ist"), ziehen sie beim
 *   RNG-Tie-Break-Wurf in `policyProvider.ts` einen Wurf pro Kandidat aus
 *   demselben Stream — mehr Kandidaten in der (nach Label sortierten) Liste
 *   verschieben, wieviele Wuerfe vor einem spaeter stehenden Kandidaten
 *   passieren. Determinismus bleibt gewahrt, die genaue Zahlenfolge nicht.
 *
 * Davor: mit der Bucket-Tabelle (Doc 08 §8.2.2), die als `config.buckets` in
 * die `MatchConfig` kam — dort war die Ereignisfolge nachweislich
 * unveraendert (nachgerechnet ueber `canonicalJson` ohne `matchId`), nur die
 * `MatchId` verschob sich.
 *
 * Davor: als Intuition eine zweite Quelle bekam (Fehlernten) und `moveGain`
 * an die Seltenheit von Ortswechseln angepasst wurde.
 *
 * Davor: mit der Erweiterung um Faehigkeiten, Macht und Kampf.
 */
const GOLDEN = {
  /** Seed 42, 30 Agenten, 100 Runden — das Abnahmekriterium des ersten Schritts. */
  seed42x100: '4a1b50a480c14df8',
  /** Derselbe Lauf ueber 400 Runden. */
  seed42x400: 'e17a76f95ba18e2a',
  /** Anderer Seed, damit ein konstanter Hash nicht als Determinismus durchgeht. */
  seed7x100: '64d11e65f9b5754e',
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

  it('trifft fuer jeden lebenden Agenten in jeder Runde eine Entscheidung', () => {
    // Weniger als Runden × Agenten, weil Ausgeschiedene nicht mehr handeln —
    // aber nicht beliebig viel weniger.
    expect(result.decisions).toBeLessThanOrEqual(400 * 30);
    expect(result.decisions).toBeGreaterThan(400 * 20);
  });

  it('nutzt alle fuenf implementierten Aktionen', () => {
    for (const type of ['rest', 'gather_resource', 'consume']) {
      expect(result.actionCounts[type], `${type} wurde nie gewaehlt`).toBeGreaterThan(50);
    }
    // Umziehen und Angreifen sind seltener — aber sie muessen vorkommen.
    for (const type of ['move', 'attack']) {
      expect(result.actionCounts[type], `${type} wurde nie gewaehlt`).toBeGreaterThan(10);
    }
  });

  it('laesst Agenten ausscheiden, aber nicht das ganze Feld', () => {
    // Mit `satietyDecayPerRound: 4` steht einem Bedarf von 4,8 Nahrung pro
    // Runde ein Nachschub von 23 gegenueber — knapp genug, dass die Wahl des
    // Ortes zaehlt, weit genug von der Ausloeschung entfernt, dass ein Lauf
    // etwas zeigt. Beim frueheren Wert 1 ueberlebten alle 30 und niemand hatte
    // je einen Grund zu kaempfen.
    const alive = result.leaderboard.filter((entry) => entry.alive).length;
    expect(alive).toBeLessThan(30);
    expect(alive).toBeGreaterThan(5);
  });

  it('entwickelt unterschiedliche Faehigkeiten', () => {
    const alive = result.leaderboard.filter((entry) => entry.alive);
    const spread = (pick: (e: (typeof alive)[number]) => number): number =>
      Math.max(...alive.map(pick)) - Math.min(...alive.map(pick));

    expect(
      Math.max(
        spread((e) => e.attributes.strength),
        spread((e) => e.attributes.intuition),
        spread((e) => e.attributes.intelligence),
      ),
    ).toBeGreaterThan(20);
  });

  it('erzeugt Wissen', () => {
    const knowing = Object.values(result.state.agents).filter(
      (agent) => agent && Object.keys(agent.knowledge).length > 0,
    );
    expect(knowing.length).toBeGreaterThan(15);
  });

  it('haelt die Reject-Rate bei null', () => {
    expect(result.rejectRate).toBe(0);
  });

  it('erzeugt Ernten, die tatsaechlich ankommen', () => {
    expect(result.eventCounts['resource_gathered']).toBeGreaterThan(1000);
  });
});
