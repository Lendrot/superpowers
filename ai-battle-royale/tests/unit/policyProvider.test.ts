import { beforeEach, describe, expect, it } from 'vitest';

import { buildAgentView } from '@/engine/agents/agentView.js';
import type { AgentView } from '@/engine/agents/agentView.js';
import type { ActionContext } from '@/engine/actions/types.js';
import { resolveConfig } from '@/engine/core/config.js';
import { EffectProjection } from '@/engine/validation/validateAction.js';
import { createRngBundle } from '@/engine/core/rng.js';
import type { AgentId, WorldState } from '@/engine/core/types.js';
import { generateCandidates } from '@/engine/decision/candidates.js';
import { policyProvider } from '@/engine/decision/policyProvider.js';
import { stockInfoId } from '@/engine/information/infoRegistry.js';
import { observedEntry } from '@/engine/information/knowledge.js';
import { effect } from '@/engine/mutation/effects.js';
import { applyEffects } from '@/engine/mutation/stateMutator.js';
import { initWorld } from '@/engine/world/initWorld.js';
import { createEventLog } from '@/engine/core/eventLog.js';
import { runRound } from '@/engine/runner/runRound.js';

const A: AgentId = 'agent_000';

let state: WorldState;

beforeEach(() => {
  state = initWorld(resolveConfig({ seed: 21, agentCount: 3 })).state;
  for (const agent of Object.values(state.agents)) {
    if (agent) agent.location = 'commons';
  }
});

function decide(): { type: string; params: Record<string, unknown>; view: AgentView } {
  const ctx: ActionContext = {
    state,
    round: state.round,
    rng: createRngBundle(1),
    projection: new EffectProjection(state),
  };
  const view = buildAgentView(state, A);
  const candidates = generateCandidates(state.agents[A]!, ctx);
  const decision = policyProvider.decide(view, candidates, { round: state.round, rng: ctx.rng });
  return { type: decision.action.type, params: decision.action.params, view };
}

function remember(location: 'fields' | 'warehouse' | 'well', food: number): void {
  applyEffects(state, [
    effect.knowledge(
      A,
      observedEntry({
        infoId: stockInfoId(location, 'food'),
        believedValue: food,
        round: state.round,
        source: 'observed',
        sourceEventId: 'event_0001_00000',
      }),
    ),
  ]);
}

describe('Policy — Erkundung muss die Wegkosten schlagen koennen', () => {
  it('zieht weiter, wenn hier nichts liegt und der Agent es sich leisten kann', () => {
    // Genau der Fall, der die Simulation stillstehen liess: satt, ausgeruht,
    // hier ist nichts zu holen, ueber die Nachbarn ist nichts bekannt.
    // Vorher war der Erkundungsterm (max 0.15) kleiner als die Wegkosten
    // (min 0.45) — Nachsehen konnte also nie gewinnen, und nach der ersten
    // Verteilung zog nie wieder jemand um.
    state.agents[A]!.needs = { satiety: 90, energy: 100 };
    state.agents[A]!.resources = { food: 10, coins: 0, materials: 0 };
    state.agents[A]!.personality.riskTaking = 80;
    state.locations['commons']!.stock = { food: 0, coins: 0, materials: 0 };

    expect(decide().type).toBe('move');
  });

  it('bleibt, wenn hier reichlich liegt', () => {
    state.agents[A]!.needs = { satiety: 90, energy: 100 };
    state.agents[A]!.resources = { food: 0, coins: 0, materials: 0 };
    state.locations['commons']!.stock = { food: 30, coins: 0, materials: 0 };

    expect(decide().type).toBe('gather_resource');
  });

  it('erkundet nicht, wenn der Agent es sich nicht leisten kann', () => {
    // Kein Vorrat, wenig Energie: wer knapp dran ist, macht keine Ausfluege.
    state.agents[A]!.needs = { satiety: 60, energy: 12 };
    state.agents[A]!.resources = { food: 0, coins: 0, materials: 0 };
    state.agents[A]!.personality.riskTaking = 80;
    state.locations['commons']!.stock = { food: 0, coins: 0, materials: 0 };

    expect(decide().type).not.toBe('move');
  });
});

describe('Policy — Erinnerung ist ein Vergleich, keine absolute Zahl', () => {
  beforeEach(() => {
    state.agents[A]!.needs = { satiety: 90, energy: 100 };
    state.agents[A]!.resources = { food: 10, coins: 0, materials: 0 };
    state.agents[A]!.personality.riskTaking = 10; // wenig Neugier, damit nur die Erinnerung zaehlt
  });

  it('zieht zu dem Nachbarn, von dem der Agent mehr erwartet', () => {
    state.locations['commons']!.stock = { food: 4, coins: 0, materials: 0 };
    remember('fields', 40);

    const decision = decide();
    expect(decision.type).toBe('move');
    expect(decision.params['to']).toBe('fields');
  });

  it('bleibt, wenn die Erinnerung schlechter ist als der eigene Ort', () => {
    // Vorher zog eine Erinnerung an "dort lagen 20" auch dann, wenn hier 40
    // liegen: der Term war absolut statt vergleichend.
    state.locations['commons']!.stock = { food: 30, coins: 0, materials: 0 };
    state.locations['commons']!.capacity.food = 30;
    remember('fields', 5);

    expect(decide().type).not.toBe('move');
  });

  it('gewichtet die Erinnerung mit der verbliebenen Sicherheit', () => {
    state.locations['commons']!.stock = { food: 4, coins: 0, materials: 0 };
    remember('fields', 40);

    // Frisch: der Vorsprung zieht.
    expect(decide().params['to']).toBe('fields');

    // Nach 20 Runden ist die Sicherheit auf null verfallen (0.05 pro Runde),
    // die Erinnerung traegt nichts mehr bei. Der Agent geht dann allenfalls
    // aus Neugier — und diese Neugier hat er hier nicht.
    for (let i = 0; i < 20; i += 1) applyEffects(state, [effect.roundAdvance()]);
    expect(decide().type).not.toBe('move');
  });
});

describe('Policy — Ueberleben schlaegt alles', () => {
  /**
   * Geprueft wird der Verlauf, nicht die Einzelentscheidung. Ob ein Agent mit
   * 25 Saettigung sofort aufbricht oder erst noch zwei Runden Material sammelt,
   * ist eine Ermessensfrage — dass er den Ort verlaesst, bevor er verhungert,
   * ist es nicht.
   */
  function soloRun(setup: (agent: NonNullable<WorldState['agents'][AgentId]>) => void, rounds: number) {
    const config = resolveConfig({
      seed: 21,
      agentCount: 2,
      maxRounds: rounds,
      survivorThreshold: 0,
    });
    const world = initWorld(config);
    const log = createEventLog(world.state.matchId);
    const rng = createRngBundle(config.seed);
    const agent = world.state.agents[A]!;
    // Der zweite Agent steht anderswo und stoert die Messung nicht.
    world.state.agents['agent_001']!.location = 'fields';
    setup(agent);

    const trace: { round: number; satiety: number; type: string }[] = [];
    for (let i = 0; i < rounds && world.state.status === 'running'; i += 1) {
      const round = world.state.round;
      const satiety = agent.needs.satiety;
      runRound(world.state, { rng, log, provider: policyProvider });
      const own = log
        .byRound(round)
        .filter((e) => e.actorId === A && e.type !== 'action_rejected');
      trace.push({ round, satiety, type: own[0]?.type ?? 'none' });
    }
    return { agent, trace };
  }

  it('verlaesst einen Ort ohne Nahrung, bevor er verhungert', () => {
    const { agent, trace } = soloRun((a) => {
      a.location = 'workshop'; // Nahrungskapazitaet null, hier waechst nie Essbares
      a.needs = { satiety: 30, energy: 100 };
      a.resources = { food: 0, coins: 0, materials: 0 };
    }, 60);

    const firstMove = trace.find((t) => t.type === 'agent_moved');
    expect(firstMove, 'Agent ist nie aufgebrochen').toBeDefined();
    expect(firstMove!.satiety).toBeGreaterThan(0);
    expect(agent.alive).toBe(true);
  });

  it('isst, bevor die Saettigung auf null faellt', () => {
    const { agent, trace } = soloRun((a) => {
      a.location = 'workshop';
      a.needs = { satiety: 30, energy: 100 };
      a.resources = { food: 5, coins: 0, materials: 0 };
    }, 60);

    const firstMeal = trace.find((t) => t.type === 'food_consumed');
    expect(firstMeal, 'Agent hat nie gegessen').toBeDefined();
    expect(firstMeal!.satiety).toBeGreaterThan(0);
    expect(agent.alive).toBe(true);
  });
});

describe('Policy — Form der Bewertung', () => {
  it('weist jeden Beitrag einzeln aus (Doc 05 §5.2)', () => {
    const ctx: ActionContext = {
      state,
      round: state.round,
      rng: createRngBundle(1),
      projection: new EffectProjection(state),
    };
    const view = buildAgentView(state, A);
    const decision = policyProvider.decide(view, generateCandidates(state.agents[A]!, ctx), {
      round: state.round,
      rng: ctx.rng,
    });

    for (const scored of decision.scored) {
      expect(Object.keys(scored.breakdown).length).toBeGreaterThan(1);
      const sum = Object.values(scored.breakdown).reduce((a, b) => a + b, 0);
      expect(scored.score).toBeCloseTo(sum);
    }
  });

  it('bewertet Ernten mit null, wo nichts zu holen ist', () => {
    // Multiplikativ statt additiv: ohne diese Eigenschaft gewinnt Ernten auch
    // an einem leergeraeumten Ort und verdraengt jede Alternative.
    state.locations['commons']!.stock = { food: 1, coins: 0, materials: 0 };
    for (const agent of Object.values(state.agents)) {
      if (agent) agent.location = 'commons';
    }
    const ctx: ActionContext = {
      state,
      round: state.round,
      rng: createRngBundle(1),
      projection: new EffectProjection(state),
    };
    const decision = policyProvider.decide(
      buildAgentView(state, A),
      generateCandidates(state.agents[A]!, ctx),
      { round: state.round, rng: ctx.rng },
    );

    const gather = decision.scored.find((s) => s.candidate.type === 'gather_resource');
    expect(gather?.breakdown['yield']).toBeLessThan(0.2);
  });
});
