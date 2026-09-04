import { beforeEach, describe, expect, it } from 'vitest';

import { resolveConfig } from '@/engine/core/config.js';
import type { AgentId, EpisodicMemory, WorldEvent, WorldState } from '@/engine/core/types.js';
import { memoryEffects } from '@/engine/memory/episodes.js';
import { applyEffects } from '@/engine/mutation/stateMutator.js';
import { initWorld } from '@/engine/world/initWorld.js';

const A: AgentId = 'agent_000';
const B: AgentId = 'agent_001';
const C: AgentId = 'agent_002';
const FAR: AgentId = 'agent_003';

let state: WorldState;

beforeEach(() => {
  state = initWorld(resolveConfig({ seed: 11, agentCount: 4 })).state;
  for (const id of [A, B, C]) state.agents[id]!.location = 'commons';
  state.agents[FAR]!.location = 'outskirts';
});

function event(patch: Partial<WorldEvent> = {}): WorldEvent {
  return {
    id: 'event_0001_00000',
    matchId: state.matchId,
    round: 1,
    seq: 0,
    type: 'trade_accepted',
    actorId: A,
    targetId: B,
    locationId: 'commons',
    payload: {},
    visibility: { scope: 'location', locationId: 'commons' },
    infoRefs: [],
    ...patch,
  };
}

function episodesFor(agentId: AgentId, effects: ReturnType<typeof memoryEffects>['effects']): EpisodicMemory[] {
  return effects
    .filter((e): e is Extract<typeof e, { t: 'episode_add' }> => e.t === 'episode_add' && e.agentId === agentId)
    .map((e) => e.episode);
}

describe('memoryEffects — welche Events werden zu Episoden', () => {
  it('erzeugt keine Episode fuer einen mundanen Event-Typ', () => {
    const result = memoryEffects(state, [event({ type: 'resource_gathered', targetId: undefined })], 1);
    expect(result.effects.filter((e) => e.t === 'episode_add')).toEqual([]);
    expect(result.written).toBe(0);
  });

  it('emittiert genau ein episode_upkeep pro lebendem Agenten, unabhaengig von Aktivitaet', () => {
    const result = memoryEffects(state, [], 1);
    const upkeeps = result.effects.filter((e) => e.t === 'episode_upkeep');
    expect(upkeeps).toHaveLength(4);
  });

  it('erzeugt Episoden nur fuer Beobachter im Sichtbarkeitsbereich (Location)', () => {
    const result = memoryEffects(state, [event()], 1);
    expect(episodesFor(A, result.effects)).toHaveLength(1);
    expect(episodesFor(B, result.effects)).toHaveLength(1);
    expect(episodesFor(C, result.effects)).toHaveLength(1);
    expect(episodesFor(FAR, result.effects)).toHaveLength(0);
    expect(result.written).toBe(3);
  });
});

describe('memoryEffects — Rollen', () => {
  it('weist actor/target/witness korrekt zu', () => {
    const result = memoryEffects(state, [event()], 1);
    expect(episodesFor(A, result.effects)[0]!.role).toBe('actor');
    expect(episodesFor(B, result.effects)[0]!.role).toBe('target');
    expect(episodesFor(C, result.effects)[0]!.role).toBe('witness');
  });

  it('weist bei information_shared/information_refused "told" statt "target" zu', () => {
    const result = memoryEffects(
      state,
      [event({ type: 'information_shared', visibility: { scope: 'location', locationId: 'commons' } })],
      1,
    );
    expect(episodesFor(B, result.effects)[0]!.role).toBe('told');
  });
});

describe('memoryEffects — Salience', () => {
  it('liegt fuer Beteiligte (actor/target) hoeher als fuer Zeugen', () => {
    const result = memoryEffects(state, [event({ type: 'agent_attacked' })], 1);
    const actorSalience = episodesFor(A, result.effects)[0]!.salience;
    const targetSalience = episodesFor(B, result.effects)[0]!.salience;
    const witnessSalience = episodesFor(C, result.effects)[0]!.salience;
    expect(targetSalience).toBeGreaterThan(witnessSalience);
    expect(actorSalience).toBeGreaterThan(witnessSalience);
  });

  it('steigt, wenn eine Allianz beteiligt ist (allianceId gesetzt) — sonst identisches Event', () => {
    const base = memoryEffects(state, [event({ type: 'alliance_expelled' })], 1);
    const boosted = memoryEffects(
      state,
      [event({ type: 'alliance_expelled', allianceId: 'alliance_0001_00000' })],
      1,
    );
    expect(episodesFor(C, boosted.effects)[0]!.salience).toBeGreaterThan(
      episodesFor(C, base.effects)[0]!.salience,
    );
  });

  it('bleibt in 0..1 geklemmt', () => {
    const result = memoryEffects(state, [event({ type: 'agent_killed' })], 1);
    for (const episode of [...episodesFor(A, result.effects), ...episodesFor(B, result.effects), ...episodesFor(C, result.effects)]) {
      expect(episode.salience).toBeGreaterThanOrEqual(0);
      expect(episode.salience).toBeLessThanOrEqual(1);
    }
  });
});

describe('episode_add / episode_upkeep ueber den StateMutator', () => {
  it('haengt eine Episode an und laesst sie bei episode_upkeep verfallen', () => {
    const first = memoryEffects(state, [event()], 1);
    applyEffects(state, first.effects);
    const before = state.agents[C]!.episodic[0]!.salience;
    expect(before).toBeGreaterThan(0);

    // Naechste Runde: nur Upkeep, kein neues Event.
    const second = memoryEffects(state, [], 2);
    applyEffects(state, second.effects);
    const after = state.agents[C]!.episodic[0]!.salience;
    expect(after).toBeCloseTo(before * (1 - state.config.memory.salienceDecay));
  });

  it('lehnt eine doppelt hinzugefuegte Episode ab (dieselbe EventId)', () => {
    const result = memoryEffects(state, [event()], 1);
    applyEffects(state, result.effects);
    expect(() => applyEffects(state, result.effects)).toThrow(/existiert bereits/);
  });
});
