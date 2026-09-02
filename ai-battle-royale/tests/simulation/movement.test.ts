import { describe, expect, it } from 'vitest';

import { resolveConfig } from '@/engine/core/config.js';
import type { AgentId, LocationId } from '@/engine/core/types.js';
import { runMatch } from '@/engine/runner/runMatch.js';

/**
 * Regression: die Welt darf nicht stillstehen.
 *
 * Gemessen wurde: nach Runde 289 zog in 1 700 weiteren Runden kein einziger
 * Agent mehr um. Ursache war kein Gewicht, sondern eine Groessenordnung — der
 * Erkundungsterm konnte die Wegkosten gar nicht schlagen. Sobald die
 * Ueberzeugungen ueber die Nachbarorte verfallen waren, war Nachsehen dauerhaft
 * unbezahlbar; ausgerechnet der Wissensverfall schaltete die Neugier ab.
 *
 * Dieser Test prueft nicht, dass viel gewandert wird — ein stabiles
 * Gleichgewicht ist ein legitimes Ergebnis, und Bewegung zu erzwingen waere
 * schlechter als keine. Er prueft, dass Bewegung ueber die ganze Strecke
 * *moeglich bleibt*.
 */

const ROUNDS = 1200;
const AGENTS = 30;

describe('Bewegung friert nicht ein', () => {
  const result = runMatch(resolveConfig({ seed: 42, agentCount: AGENTS, maxRounds: ROUNDS }));
  const moves = result.log.events.filter((event) => event.type === 'agent_moved');

  it('bewegt Agenten auch im letzten Viertel des Laufs', () => {
    const lastQuarter = moves.filter((event) => event.round > (ROUNDS * 3) / 4);
    expect(lastQuarter.length).toBeGreaterThan(0);
  });

  it('verteilt Bewegung ueber alle vier Viertel', () => {
    const quarters = [0, 1, 2, 3].map(
      (q) =>
        moves.filter(
          (event) =>
            event.round > (ROUNDS * q) / 4 && event.round <= (ROUNDS * (q + 1)) / 4,
        ).length,
    );
    for (const [index, count] of quarters.entries()) {
      expect(count, `Viertel ${index + 1} ohne Bewegung`).toBeGreaterThan(0);
    }
  });

  it('wandert nicht ziellos — die meisten Agenten bleiben die meiste Zeit stehen', () => {
    // Die Gegenprobe zum Einfrieren: staendiges Hin und Her waere genauso
    // falsch. Ein Ortswechsel kostet eine Runde, also darf er nicht der
    // Normalfall sein.
    const share = moves.length / result.decisions;
    expect(share).toBeGreaterThan(0.01);
    expect(share).toBeLessThan(0.2);
  });

  it('erreicht eine Verteilung, die der Regeneration ungefaehr folgt', () => {
    // Ideal-free distribution: wo mehr nachwaechst, stehen mehr Agenten.
    // Ohne funktionierende Bewegung gilt das nicht — dann bleibt die zufaellige
    // Startverteilung stehen.
    const occupants = new Map<LocationId, number>();
    for (const agent of Object.values(result.state.agents)) {
      if (!agent?.alive) continue;
      occupants.set(agent.location, (occupants.get(agent.location) ?? 0) + 1);
    }

    const fields = occupants.get('fields') ?? 0;
    const outskirts = occupants.get('outskirts') ?? 0;
    // `fields` regeneriert 12 Nahrung pro Runde, `outskirts` keine.
    expect(fields).toBeGreaterThan(outskirts);
  });

  it('besucht mehr Orte, als die Startverteilung vorgab', () => {
    const visited = new Map<AgentId, Set<LocationId>>();
    for (const event of moves) {
      if (!event.actorId) continue;
      const to = event.payload['to'];
      if (typeof to !== 'string') continue;
      const set = visited.get(event.actorId) ?? new Set<LocationId>();
      set.add(to as LocationId);
      visited.set(event.actorId, set);
    }

    const travellers = [...visited.values()].filter((set) => set.size >= 2).length;
    expect(travellers).toBeGreaterThan(AGENTS / 3);
  });
});
