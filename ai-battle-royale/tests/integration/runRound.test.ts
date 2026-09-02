import { describe, expect, it } from 'vitest';

import { resolveConfig } from '@/engine/core/config.js';
import { createEventLog } from '@/engine/core/eventLog.js';
import { assertInvariants, totalResources } from '@/engine/core/invariants.js';
import type { AgentAction, WorldState } from '@/engine/core/types.js';
import type { AgentView } from '@/engine/agents/agentView.js';
import { policyProvider } from '@/engine/decision/policyProvider.js';
import type { DecisionProvider } from '@/engine/decision/provider.js';
import { runRound } from '@/engine/runner/runRound.js';
import { runMatch } from '@/engine/runner/runMatch.js';
import { initWorld } from '@/engine/world/initWorld.js';
import { createRngBundle } from '@/engine/core/rng.js';

function setup(overrides: Parameters<typeof resolveConfig>[0] = {}) {
  const config = resolveConfig({ seed: 5, agentCount: 8, maxRounds: 10, ...overrides });
  const { state, rng } = initWorld(config);
  const log = createEventLog(state.matchId);
  return { state, rng, log, config };
}

/** Provider, der immer dieselbe Aktion liefert — auch eine unzulaessige. */
function scripted(build: (view: Readonly<AgentView>) => AgentAction): DecisionProvider {
  return {
    name: 'scripted',
    decide: (view) => ({ action: build(view), scored: [] }),
  };
}

describe('runRound — Phasenfluss', () => {
  it('faehrt eine Runde und erhoeht den Rundenzaehler', () => {
    const { state, rng, log } = setup();
    const result = runRound(state, { rng, log, provider: policyProvider });

    expect(result.round).toBe(1);
    expect(state.round).toBe(2);
    expect(result.decisions).toBe(8);
    expect(result.finished).toBe(false);
  });

  it('trifft fuer jeden lebenden Agenten genau eine Entscheidung', () => {
    const { state, rng, log } = setup();
    state.agents['agent_000']!.alive = false;
    state.agents['agent_000']!.eliminatedRound = 1;
    state.agents['agent_000']!.eliminationCause = 'starvation';

    const result = runRound(state, { rng, log, provider: policyProvider });
    expect(result.decisions).toBe(7);
  });

  it('schreibt Rundenklammer-Events ins Log', () => {
    const { state, rng, log } = setup();
    runRound(state, { rng, log, provider: policyProvider });

    const types = log.events.map((e) => e.type);
    expect(types[0]).toBe('round_started');
    expect(types.at(-1)).toBe('round_ended');
  });

  it('haelt die Invarianten nach jeder Runde', () => {
    const { state, rng, log } = setup({ maxRounds: 25 });
    for (let i = 0; i < 25 && state.status === 'running'; i += 1) {
      runRound(state, { rng, log, provider: policyProvider });
      expect(() => assertInvariants(state)).not.toThrow();
    }
  });

  it('lehnt eine weitere Runde nach dem Matchende ab', () => {
    const { state, rng, log } = setup({ maxRounds: 1 });
    runRound(state, { rng, log, provider: policyProvider });
    expect(state.status).toBe('finished');
    expect(() => runRound(state, { rng, log, provider: policyProvider })).toThrow(/bereits beendet/);
  });
});

describe('runRound — Validierung und Fallback', () => {
  it('faengt eine unzulaessige Aktion ab und faellt auf rest zurueck', () => {
    const { state, rng, log } = setup();
    for (const agent of Object.values(state.agents)) {
      if (agent) agent.needs.energy = 5; // zu wenig fuer gather_resource
    }

    const result = runRound(state, {
      rng,
      log,
      provider: scripted((view) => ({
        actorId: view.self.id,
        type: 'gather_resource',
        params: { resource: 'food' },
        source: 'scripted',
      })),
    });

    expect(result.rejects.precondition_failed).toBe(8);
    expect(result.actionCounts['rest']).toBe(8);
    expect(log.events.filter((e) => e.type === 'action_rejected')).toHaveLength(8);
  });

  it('faengt eine Aktion mit kaputtem Schema ab', () => {
    const { state, rng, log } = setup();
    const result = runRound(state, {
      rng,
      log,
      provider: scripted((view) => ({
        actorId: view.self.id,
        type: 'nonsense' as AgentAction['type'],
        params: {},
        source: 'scripted',
      })),
    });

    expect(result.rejects.schema_invalid).toBe(8);
    expect(result.actionCounts['rest']).toBe(8);
  });

  it('erzeugt mit der eigenen Policy keine Rejects', () => {
    const { state, rng, log } = setup({ maxRounds: 30 });
    for (let i = 0; i < 30 && state.status === 'running'; i += 1) {
      const result = runRound(state, { rng, log, provider: policyProvider });
      // Doc 08 §8.1: eine Reject-Rate > 0 hiesse, der Kandidatengenerator haette
      // etwas angeboten, das die Validierung ablehnt.
      expect(Object.values(result.rejects).reduce((a, b) => a + b, 0)).toBe(0);
    }
  });
});

describe('runRound — Ressourcenfluss', () => {
  it('verschiebt Bestand vom Ort zum Agenten, ohne Muenzen zu erzeugen', () => {
    const { state, rng, log } = setup({ maxRounds: 40 });
    const coinsAtStart = totalResources(state).coins;

    for (let i = 0; i < 40 && state.status === 'running'; i += 1) {
      runRound(state, { rng, log, provider: policyProvider });
      expect(totalResources(state).coins).toBe(coinsAtStart);
    }
  });

  it('loest Konkurrenz am selben Ort first-come-first-served auf', () => {
    const { state, rng, log } = setup();
    // Alle an denselben Ort, Bestand knapp: es kann nicht jeder ernten.
    for (const agent of Object.values(state.agents)) {
      if (!agent) continue;
      agent.location = 'outskirts';
      agent.needs.energy = 100;
      agent.resources.materials = 0;
    }
    state.locations['outskirts']!.stock.materials = 4;

    runRound(state, { rng, log, provider: policyProvider });

    const gathered = log.events.filter((e) => e.type === 'resource_gathered');
    const failed = log.events.filter((e) => e.type === 'gather_failed');
    expect(gathered.length).toBeGreaterThan(0);
    expect(failed.length).toBeGreaterThan(0);
    // Nie mehr entnommen als vorhanden war (4 + 3 Regeneration).
    const total = gathered.reduce((sum, e) => sum + Number(e.payload['amount']), 0);
    expect(total).toBeLessThanOrEqual(7);
  });
});

describe('runMatch', () => {
  it('endet am Rundenlimit', () => {
    const result = runMatch(resolveConfig({ seed: 5, agentCount: 8, maxRounds: 12 }));
    expect(result.rounds).toBe(12);
    expect(result.endReason).toBe('round_limit');
    expect(result.state.status).toBe('finished');
  });

  it('endet, wenn die Ueberlebensschwelle erreicht ist', () => {
    const config = resolveConfig({ seed: 5, agentCount: 8, maxRounds: 50, survivorThreshold: 7 });
    const { state } = initWorld(config);
    // Direkt geprueft ueber die Scoring-Bedingung: sieben Ueberlebende genuegen.
    const log = createEventLog(state.matchId);
    const rng = createRngBundle(config.seed);
    const victim = state.agents['agent_000']!;
    victim.alive = false;
    victim.eliminatedRound = 1;
    victim.eliminationCause = 'starvation';

    const result = runRound(state, { rng, log, provider: policyProvider });
    expect(result.finished).toBe(true);
    expect(state.endReason).toBe('survivor_threshold');
  });

  it('weist llmMode ausser off zurueck, statt so zu tun', () => {
    expect(() => runMatch(resolveConfig({ llmMode: 'live' }))).toThrow(/nicht implementiert/);
    expect(() => runMatch(resolveConfig({ llmMode: 'mock' }))).toThrow(/nicht implementiert/);
  });

  it('liefert einen Leaderboard, absteigend sortiert', () => {
    const result = runMatch(resolveConfig({ seed: 5, agentCount: 8, maxRounds: 20 }));
    const scores = result.leaderboard.map((entry) => entry.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(result.leaderboard).toHaveLength(8);
  });
});

describe('Simulationslauf ueber 200 Runden', () => {
  it('haelt Invarianten, Erhaltung und Reject-Rate ueber die ganze Strecke', () => {
    const config = resolveConfig({ seed: 123, agentCount: 30, maxRounds: 200 });
    const { state, rng } = initWorld(config);
    const log = createEventLog(state.matchId);
    const coinsAtStart = totalResources(state).coins;
    let rejects = 0;
    let decisions = 0;

    while (state.status === 'running') {
      const result = runRound(state, { rng, log, provider: policyProvider });
      rejects += Object.values(result.rejects).reduce((a, b) => a + b, 0);
      decisions += result.decisions;
      assertInvariants(state);
      expect(totalResources(state).coins).toBe(coinsAtStart);
    }

    // Die letzte gespielte Runde bleibt stehen: am Rundenlimit wird das Match
    // beendet statt weitergezaehlt.
    expect(state.round).toBe(200);
    expect(state.endReason).toBe('round_limit');
    expect(rejects / decisions).toBeLessThan(0.02);
    expectNoNegatives(state);
  });
});

function expectNoNegatives(state: Readonly<WorldState>): void {
  for (const agent of Object.values(state.agents)) {
    if (!agent) continue;
    expect(agent.resources.food).toBeGreaterThanOrEqual(0);
    expect(agent.needs.energy).toBeGreaterThanOrEqual(0);
    expect(agent.needs.energy).toBeLessThanOrEqual(100);
  }
}
