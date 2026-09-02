import { beforeEach, describe, expect, it } from 'vitest';

import { resolveConfig } from '@/engine/core/config.js';
import type { AgentId, WorldEvent, WorldState } from '@/engine/core/types.js';
import { stockInfoId } from '@/engine/information/infoRegistry.js';
import { applyEffects } from '@/engine/mutation/stateMutator.js';
import { initWorld } from '@/engine/world/initWorld.js';
import { perceptionEffects, resolveObservers } from '@/engine/world/perception.js';

let state: WorldState;

beforeEach(() => {
  state = initWorld(resolveConfig({ seed: 8, agentCount: 6 })).state;
  // Definierte Aufstellung: drei am Marktplatz, drei auf den Feldern.
  const places = ['commons', 'commons', 'commons', 'fields', 'fields', 'fields'] as const;
  places.forEach((place, index) => {
    state.agents[`agent_00${index}` as AgentId]!.location = place;
  });
});

function event(patch: Partial<WorldEvent> = {}): WorldEvent {
  return {
    id: 'event_0001_00000',
    matchId: state.matchId,
    round: 1,
    seq: 0,
    type: 'resource_gathered',
    locationId: 'commons',
    payload: {},
    visibility: { scope: 'location', locationId: 'commons' },
    infoRefs: [],
    ...patch,
  };
}

describe('Visibility-Matrix — alle fuenf Scopes (Doc 03 §3.8)', () => {
  it('public: alle Lebenden', () => {
    expect(resolveObservers({ scope: 'public' }, state)).toHaveLength(6);
  });

  it('location: nur die Anwesenden', () => {
    expect(resolveObservers({ scope: 'location', locationId: 'commons' }, state)).toEqual([
      'agent_000',
      'agent_001',
      'agent_002',
    ]);
    expect(resolveObservers({ scope: 'location', locationId: 'well' }, state)).toEqual([]);
  });

  it('participants: nur Akteur und Ziel', () => {
    const observers = resolveObservers({ scope: 'participants' }, state, {
      actorId: 'agent_000',
      targetId: 'agent_004',
    });
    expect(observers).toEqual(['agent_000', 'agent_004']);
  });

  it('participants ohne Ziel: nur der Akteur', () => {
    expect(resolveObservers({ scope: 'participants' }, state, { actorId: 'agent_003' })).toEqual([
      'agent_003',
    ]);
  });

  it('alliance: nur Mitglieder', () => {
    state.agents['agent_001']!.allianceId = 'alliance_a';
    state.agents['agent_004']!.allianceId = 'alliance_a';
    state.agents['agent_005']!.allianceId = 'alliance_b';

    expect(resolveObservers({ scope: 'alliance', allianceId: 'alliance_a' }, state)).toEqual([
      'agent_001',
      'agent_004',
    ]);
  });

  it('private: nur die genannten', () => {
    expect(
      resolveObservers({ scope: 'private', agentIds: ['agent_002', 'agent_005'] }, state),
    ).toEqual(['agent_002', 'agent_005']);
  });

  it('ausgeschiedene Agenten beobachten nichts — in keinem Scope', () => {
    const dead = state.agents['agent_000']!;
    dead.alive = false;
    dead.eliminatedRound = 1;
    dead.eliminationCause = 'starvation';

    expect(resolveObservers({ scope: 'public' }, state)).not.toContain('agent_000');
    expect(resolveObservers({ scope: 'location', locationId: 'commons' }, state)).not.toContain(
      'agent_000',
    );
    expect(
      resolveObservers({ scope: 'private', agentIds: ['agent_000'] }, state),
    ).toEqual([]);
  });

  it('liefert die Beobachter in stabiler Reihenfolge', () => {
    const observers = resolveObservers({ scope: 'public' }, state);
    expect([...observers].sort()).toEqual(observers);
  });
});

describe('Perception — Wissen entsteht nur hier', () => {
  const foodAtCommons = stockInfoId('commons', 'food');

  it('schreibt Wissen fuer die Anwesenden und fuer sonst niemanden', () => {
    const result = perceptionEffects(state, [event({ infoRefs: [foodAtCommons] })], 2);
    applyEffects(state, result.effects);

    expect(Object.keys(state.agents['agent_000']!.knowledge)).toEqual([foodAtCommons]);
    expect(state.agents['agent_003']!.knowledge).toEqual({});
  });

  it('uebernimmt den tatsaechlichen Wert als Ueberzeugung', () => {
    state.locations['commons']!.stock.food = 17;
    applyEffects(state, perceptionEffects(state, [event({ infoRefs: [foodAtCommons] })], 2).effects);

    expect(state.agents['agent_000']!.knowledge[foodAtCommons]?.believedValue).toBe(17);
  });

  it('unterscheidet Teilnehmen von Zusehen', () => {
    applyEffects(
      state,
      perceptionEffects(state, [event({ infoRefs: [foodAtCommons], actorId: 'agent_001' })], 2)
        .effects,
    );

    expect(state.agents['agent_001']!.knowledge[foodAtCommons]?.source).toBe('participated');
    expect(state.agents['agent_000']!.knowledge[foodAtCommons]?.source).toBe('observed');
  });

  it('erzeugt kein Wissen aus einem Event ohne infoRefs', () => {
    const result = perceptionEffects(state, [event({ infoRefs: [] })], 2);
    expect(result.effects).toEqual([]);
    expect(result.written).toBe(0);
  });

  it('merkt sich die erste Begegnung und aktualisiert die Bestaetigung', () => {
    applyEffects(state, perceptionEffects(state, [event({ infoRefs: [foodAtCommons] })], 2).effects);
    applyEffects(state, perceptionEffects(state, [event({ infoRefs: [foodAtCommons] })], 9).effects);

    const entry = state.agents['agent_000']!.knowledge[foodAtCommons];
    expect(entry?.acquiredRound).toBe(2);
    expect(entry?.lastConfirmedRound).toBe(9);
  });

  it('haelt den Herkunftsnachweis fest', () => {
    applyEffects(state, perceptionEffects(state, [event({ infoRefs: [foodAtCommons] })], 2).effects);
    expect(state.agents['agent_000']!.knowledge[foodAtCommons]?.sourceEventId).toBe(
      'event_0001_00000',
    );
  });

  it('wirft, wenn ein Event auf eine unbekannte Info verweist', () => {
    expect(() =>
      perceptionEffects(state, [event({ infoRefs: ['info_gibt_es_nicht'] })], 2),
    ).toThrow(/unbekannte Info/);
  });

  it('gibt einem Agenten, der weitergezogen ist, kein Wissen mehr ueber den alten Ort', () => {
    state.agents['agent_000']!.location = 'fields';
    applyEffects(state, perceptionEffects(state, [event({ infoRefs: [foodAtCommons] })], 2).effects);

    expect(state.agents['agent_000']!.knowledge).toEqual({});
  });
});
