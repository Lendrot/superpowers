import { describe, expect, it } from 'vitest';

import type { AgentView } from '@/engine/agents/agentView.js';
import { resolveConfig } from '@/engine/core/config.js';
import { createEventLog } from '@/engine/core/eventLog.js';
import type { AgentAction, AgentId, WorldState } from '@/engine/core/types.js';
import type { DecisionProvider } from '@/engine/decision/provider.js';
import { runRound } from '@/engine/runner/runRound.js';
import { initWorld } from '@/engine/world/initWorld.js';

/**
 * Gate aus `12-build-order.md`, T20: "Lebenszyklus-Integrationstest".
 *
 * Ueber vier echte Runden durch `runRound` (nicht nur `resolve` isoliert):
 * A gruendet mit B eine Allianz, laedt danach C dazu ein, C tritt wieder aus,
 * und A schliesst zuletzt B aus — wonach die Allianz unter zwei lebende
 * Mitglieder faellt und sich selbst aufloest.
 */

const A: AgentId = 'agent_000';
const B: AgentId = 'agent_001';
const C: AgentId = 'agent_002';

let state: WorldState;

/** Provider, der pro Runde ein festes Skript fuer A/B/C faehrt, sonst `rest`. */
function scripted(script: Record<number, Partial<Record<AgentId, (view: Readonly<AgentView>) => AgentAction>>>): DecisionProvider {
  return {
    name: 'scripted',
    decide(view) {
      const forRound = script[view.round];
      const build = forRound?.[view.self.id];
      const action = build ? build(view) : { actorId: view.self.id, type: 'rest' as const, params: {}, source: 'scripted' as const };
      return { action, scored: [] };
    },
  };
}

function setup() {
  const config = resolveConfig({ seed: 31, agentCount: 3, maxRounds: 10 });
  const { state: newState, rng } = initWorld(config);
  for (const id of [A, B, C]) newState.agents[id]!.location = 'commons';
  // Genug Vertrauen, damit beide Beitritte in `acceptanceScoreFor` (offerAlliance.ts)
  // sicher ueber der Schwelle landen — dieser Test prueft den Lebenszyklus,
  // nicht die Annahme-Heuristik (die hat ihre eigenen Tests).
  for (const target of [B, C]) {
    newState.agents[target]!.relationships[A] = {
      trust: 90,
      friendship: 0,
      respect: 0,
      fear: 0,
      suspicion: 0,
      rivalry: 0,
      attraction: 0,
      debt: 0,
      interactions: 0,
      lastInteractionRound: 1,
      lastEventTypes: [],
    };
  }
  state = newState;
  return { rng, log: createEventLog(state.matchId) };
}

describe('Allianz-Lebenszyklus (T20)', () => {
  it('gruenden → beitreten → austreten → ausschliessen', () => {
    const { rng, log } = setup();

    const offerTo = (targetId: AgentId) => (view: Readonly<AgentView>): AgentAction => ({
      actorId: view.self.id,
      type: 'offer_alliance',
      params: { target: targetId },
      source: 'scripted',
    });
    const leave = (view: Readonly<AgentView>): AgentAction => ({
      actorId: view.self.id,
      type: 'leave_alliance',
      params: {},
      source: 'scripted',
    });
    const expel = (targetId: AgentId) => (view: Readonly<AgentView>): AgentAction => ({
      actorId: view.self.id,
      type: 'expel_member',
      params: { target: targetId },
      source: 'scripted',
    });

    const provider = scripted({
      1: { [A]: offerTo(B) },
      2: { [A]: offerTo(C) },
      3: { [C]: leave },
      4: { [A]: expel(B) },
    });

    // Runde 1 — Gruendung.
    runRound(state, { rng, log, provider });
    expect(state.agents[A]!.allianceId).not.toBeNull();
    expect(state.agents[A]!.allianceId).toBe(state.agents[B]!.allianceId);
    const allianceId = state.agents[A]!.allianceId!;
    let alliance = state.alliances[allianceId]!;
    expect(alliance.leaderId).toBe(A);
    expect(alliance.members).toEqual([A, B].sort());
    expect(log.events.some((e) => e.type === 'alliance_offer_accepted' && e.actorId === A)).toBe(true);

    // Runde 2 — Beitritt.
    runRound(state, { rng, log, provider });
    expect(state.agents[C]!.allianceId).toBe(allianceId);
    alliance = state.alliances[allianceId]!;
    expect(alliance.members).toEqual([A, B, C].sort());

    // Runde 3 — Austritt.
    runRound(state, { rng, log, provider });
    expect(state.agents[C]!.allianceId).toBeNull();
    alliance = state.alliances[allianceId]!;
    expect(alliance.members).toEqual([A, B].sort());
    expect(alliance.dissolvedRound).toBeUndefined();
    expect(
      log.events.some((e) => e.type === 'alliance_left' && e.actorId === C && e.round === 3),
    ).toBe(true);

    // Runde 4 — Ausschluss. Danach bleibt nur noch A lebend Mitglied — die
    // Allianz loest sich deshalb selbst auf (unter zwei lebenden Mitgliedern
    // ist keine Allianz mehr).
    runRound(state, { rng, log, provider });
    alliance = state.alliances[allianceId]!;
    expect(alliance.dissolvedRound).toBe(4);
    expect(state.agents[A]!.allianceId).toBeNull();
    expect(state.agents[B]!.allianceId).toBeNull();
    expect(state.agents[B]!.status.exiledFrom).toContain(allianceId);
    expect(
      log.events.some((e) => e.type === 'alliance_expelled' && e.actorId === A && e.targetId === B),
    ).toBe(true);
  });
});
