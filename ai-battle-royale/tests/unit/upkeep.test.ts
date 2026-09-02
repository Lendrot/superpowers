import { beforeEach, describe, expect, it } from 'vitest';

import { resolveConfig } from '@/engine/core/config.js';
import { createEventLog } from '@/engine/core/eventLog.js';
import { createRngBundle } from '@/engine/core/rng.js';
import type { AgentId, WorldState } from '@/engine/core/types.js';
import { policyProvider } from '@/engine/decision/policyProvider.js';
import { applyEffects } from '@/engine/mutation/stateMutator.js';
import { runRound } from '@/engine/runner/runRound.js';
import { initWorld } from '@/engine/world/initWorld.js';
import { upkeep } from '@/engine/world/upkeep.js';

const A: AgentId = 'agent_000';

let state: WorldState;

beforeEach(() => {
  state = initWorld(resolveConfig({ seed: 3, agentCount: 4 })).state;
});

describe('Upkeep — Regeneration', () => {
  it('fuellt Ortsbestaende auf', () => {
    state.locations['fields']!.stock.food = 10;
    applyEffects(state, upkeep(state).effects);
    expect(state.locations['fields']!.stock.food).toBe(22); // 10 + 12 Regeneration
  });

  it('regeneriert nie ueber die Kapazitaet', () => {
    const fields = state.locations['fields']!;
    fields.stock.food = fields.capacity.food - 3;
    applyEffects(state, upkeep(state).effects);
    expect(fields.stock.food).toBe(fields.capacity.food);
  });

  it('erzeugt nirgends Muenzen', () => {
    applyEffects(state, upkeep(state).effects);
    for (const location of Object.values(state.locations)) {
      expect(location?.regenPerRound.coins ?? 0).toBe(0);
    }
  });
});

describe('Upkeep — Beduerfnisse', () => {
  it('senkt Saettigung und hebt Energie', () => {
    state.agents[A]!.needs = { satiety: 50, energy: 50 };
    applyEffects(state, upkeep(state).effects);
    expect(state.agents[A]!.needs).toEqual({ satiety: 46, energy: 52 });
  });

  it('zaehlt Hunger erst ab null', () => {
    state.agents[A]!.needs.satiety = 1;
    applyEffects(state, upkeep(state).effects);
    expect(state.agents[A]!.status.hungerStreak).toBe(1);

    applyEffects(state, upkeep(state).effects);
    expect(state.agents[A]!.status.hungerStreak).toBe(2);
  });

  it('setzt den Hungerzaehler zurueck, sobald wieder etwas im Magen ist', () => {
    state.agents[A]!.needs.satiety = 0;
    state.agents[A]!.status.hungerStreak = 2;
    state.agents[A]!.needs.satiety = 40;
    applyEffects(state, upkeep(state).effects);
    expect(state.agents[A]!.status.hungerStreak).toBe(0);
  });
});

describe('T08 — Ausscheiden', () => {
  it('laesst einen Agenten in der erwarteten Runde verhungern', () => {
    // Der Mechanismus, isoliert: Saettigung 3 und ein Verfall von 4 pro Runde
    // bringen die Saettigung schon in Runde 1 auf null. Der Zaehler steht dann
    // auf 1 und erreicht in Runde 3 die Schwelle 3.
    //
    // Bewusst ohne `runRound`: dort erntet und isst die Policy, und ein Agent,
    // der zu essen findet, verhungert zu Recht nicht. Dass Ausscheiden auch im
    // vollen Lauf vorkommt, prueft `tests/simulation/lifecycle.test.ts`.
    state.agents[A]!.needs.satiety = 3;
    state.agents[A]!.resources.food = 0;

    const eliminatedIn: number[] = [];
    for (let round = 1; round <= 8; round += 1) {
      if (!state.agents[A]!.alive) break;
      applyEffects(state, upkeep(state).effects);
      if (!state.agents[A]!.alive) eliminatedIn.push(state.round);
      applyEffects(state, [{ t: 'round_advance' }]);
    }

    expect(eliminatedIn).toEqual([3]);
    expect(state.agents[A]!.eliminationCause).toBe('starvation');
    expect(state.agents[A]!.eliminatedRound).toBe(3);
  });

  it('laesst einen erschoepften Agenten ausscheiden', () => {
    const config = resolveConfig({
      seed: 3,
      agentCount: 4,
      economy: { energyRegenPerRound: 0, restEnergyGain: 0 },
    });
    const world = initWorld(config);
    for (const agent of Object.values(world.state.agents)) {
      if (agent) agent.needs.energy = 0;
    }

    for (let i = 0; i < 3; i += 1) {
      applyEffects(world.state, upkeep(world.state).effects);
    }

    expect(world.state.agents[A]!.alive).toBe(false);
    expect(world.state.agents[A]!.eliminationCause).toBe('exhaustion');
  });

  it('meldet Verhungern vor Erschoepfung, wenn beides zugleich zutrifft', () => {
    const config = resolveConfig({
      seed: 3,
      agentCount: 4,
      economy: { energyRegenPerRound: 0 },
    });
    const world = initWorld(config);
    const agent = world.state.agents[A]!;
    agent.needs = { satiety: 0, energy: 0 };
    agent.status = { hungerStreak: 2, exhaustionStreak: 2, exiledFrom: [] };

    applyEffects(world.state, upkeep(world.state).effects);
    expect(agent.eliminationCause).toBe('starvation');
  });

  it('macht das Ausscheiden oeffentlich und registriert es als Info', () => {
    state.agents[A]!.needs.satiety = 0;
    state.agents[A]!.status.hungerStreak = 2;

    const result = upkeep(state);
    const event = result.events.find((e) => e.type === 'agent_eliminated');

    expect(event?.visibility).toEqual({ scope: 'public' });
    expect(event?.infoRefs).toEqual(['info_event_eliminated_agent_000']);

    applyEffects(state, result.effects);
    expect(state.infoRegistry['info_event_eliminated_agent_000']).toBeDefined();
  });

  it('teilt das Ausscheiden in der Folgerunde allen Ueberlebenden mit', () => {
    const config = resolveConfig({ seed: 3, agentCount: 4, maxRounds: 10 });
    const world = initWorld(config);
    const log = createEventLog(world.state.matchId);
    const rng = createRngBundle(config.seed);

    world.state.agents[A]!.needs.satiety = 0;
    world.state.agents[A]!.status.hungerStreak = 2;

    runRound(world.state, { rng, log, provider: policyProvider });
    runRound(world.state, { rng, log, provider: policyProvider });

    for (const agent of Object.values(world.state.agents)) {
      if (!agent?.alive) continue;
      expect(agent.knowledge['info_event_eliminated_agent_000']).toBeDefined();
    }
  });
});
