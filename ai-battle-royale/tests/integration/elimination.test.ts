import { describe, expect, it } from 'vitest';

import { resolveConfig } from '@/engine/core/config.js';
import type { InfoId } from '@/engine/core/types.js';
import { runMatch } from '@/engine/runner/runMatch.js';

/**
 * T08 end-to-end, unter einer Oekonomie, in der Nahrung tatsaechlich knapp ist.
 *
 * Die Standardeinstellung braucht das nicht mehr herzugeben: dort stehen 23
 * Nahrung Nachschub pro Runde einem Bedarf von 1,2 gegenueber, also verhungert
 * niemand. Das ist ein Befund ueber die Kalibrierung (T43), kein Grund, den
 * Ausscheide-Mechanismus ungeprueft zu lassen.
 *
 * `satietyDecayPerRound: 8` bedeutet einen Bedarf von 9,6 Nahrung pro Runde bei
 * 23 Nachschub — knapp genug, dass die Verteilung ueber die Orte zaehlt, weit
 * genug von der Ausloeschung entfernt, dass der Lauf etwas zeigt.
 */

const HARSH = resolveConfig({
  seed: 42,
  agentCount: 30,
  maxRounds: 400,
  economy: { satietyDecayPerRound: 8 },
});

describe('Ausscheiden im vollen Lauf', () => {
  const result = runMatch(HARSH);

  it('laesst Agenten verhungern, aber nicht alle', () => {
    const alive = result.leaderboard.filter((entry) => entry.alive).length;
    expect(alive).toBeLessThan(30);
    expect(alive).toBeGreaterThan(5);
  });

  it('macht jedes Ausscheiden im Log nachvollziehbar', () => {
    const events = result.log.events.filter((event) => event.type === 'agent_eliminated');
    const dead = Object.values(result.state.agents).filter((agent) => agent && !agent.alive);

    expect(events).toHaveLength(dead.length);
    for (const event of events) {
      expect(event.visibility).toEqual({ scope: 'public' });
      expect(event.payload['cause']).toBe('starvation');
      const agent = result.state.agents[event.actorId!];
      expect(agent?.eliminatedRound).toBe(event.round);
    }
  });

  it('laesst Ausgeschiedene nicht weiterhandeln', () => {
    for (const agent of Object.values(result.state.agents)) {
      if (!agent || agent.alive) continue;
      const after = result.log.events.filter(
        (event) => event.actorId === agent.id && event.round > agent.eliminatedRound!,
      );
      expect(after, `${agent.id} handelt nach dem Ausscheiden weiter`).toEqual([]);
    }
  });

  it('teilt jedes Ausscheiden allen Ueberlebenden mit', () => {
    const firstDead = Object.values(result.state.agents).find((agent) => agent && !agent.alive);
    expect(firstDead).toBeDefined();

    const infoId: InfoId = `info_event_eliminated_${firstDead!.id}`;
    const survivors = Object.values(result.state.agents).filter((agent) => agent?.alive);
    // Ausgeschieden wird oeffentlich, also weiss es danach jeder, der noch lebt.
    for (const survivor of survivors) {
      expect(survivor!.knowledge[infoId], `${survivor!.id} weiss nichts davon`).toBeDefined();
    }
  });

  it('bleibt auch unter Knappheit deterministisch und fehlerfrei', () => {
    expect(runMatch(HARSH).logHash).toBe(result.logHash);
    expect(result.rejectRate).toBe(0);
  });
});
