/**
 * T19 — Gate aus `12-build-order.md`: "Deltas pro Event-Typ getestet".
 *
 * Drei Ebenen: die Tabelle selbst (jeder Eintrag liefert etwas Sinnvolles in
 * beide Richtungen), die Persoenlichkeits-Modulation (Doc 03 §3.3, woertliches
 * Beispiel: Empathie verstaerkt, Loyalitaet daempft Argwohn), und der
 * `StateMutator`-Case (Ringpuffer, Clamping, Buchhaltung).
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { resolveConfig } from '@/engine/core/config.js';
import { defaultRelationship } from '@/engine/core/relationship.js';
import type { AgentId, EventType, Personality, WorldState } from '@/engine/core/types.js';
import { effect } from '@/engine/mutation/effects.js';
import { applyEffects } from '@/engine/mutation/stateMutator.js';
import {
  RELATIONSHIP_DELTA_TABLE,
  modulateByPersonality,
  relationshipEffectsFor,
  relationshipOf,
} from '@/engine/world/relationships.js';
import { initWorld } from '@/engine/world/initWorld.js';

const A: AgentId = 'agent_000';
const B: AgentId = 'agent_001';

const NEUTRAL: Personality = {
  ambition: 50,
  loyalty: 50,
  honesty: 50,
  empathy: 50,
  riskTaking: 50,
  intelligence: 50,
  sociability: 50,
  manipulation: 50,
  dominance: 50,
};

let state: WorldState;

beforeEach(() => {
  state = initWorld(resolveConfig({ seed: 3, agentCount: 4 })).state;
});

describe('defaultRelationship', () => {
  it('ist neutral in jeder Dimension — man kennt sich noch nicht', () => {
    const rel = defaultRelationship();
    expect(rel.trust).toBe(0);
    expect(rel.debt).toBe(0);
    expect(rel.interactions).toBe(0);
    expect(rel.lastEventTypes).toEqual([]);
  });
});

describe('modulateByPersonality', () => {
  it('verstaerkt positive Deltas mit Empathie', () => {
    const empathic: Personality = { ...NEUTRAL, empathy: 100 };
    const cold: Personality = { ...NEUTRAL, empathy: 0 };
    const empathicOut = modulateByPersonality(empathic, { trust: 10 });
    const coldOut = modulateByPersonality(cold, { trust: 10 });
    expect(empathicOut.trust!).toBeGreaterThan(coldOut.trust!);
  });

  it('daempft Argwohn-Anstieg mit Loyalitaet — woertliches Beispiel aus Doc 03 §3.3', () => {
    const loyal: Personality = { ...NEUTRAL, loyalty: 100 };
    const disloyal: Personality = { ...NEUTRAL, loyalty: 0 };
    const loyalOut = modulateByPersonality(loyal, { suspicion: 10 });
    const disloyalOut = modulateByPersonality(disloyal, { suspicion: 10 });
    expect(loyalOut.suspicion!).toBeLessThan(disloyalOut.suspicion!);
  });

  it('laesst negative Deltas ausser Argwohn unmoduliert — ein Schlag trifft jeden gleich hart', () => {
    const empathic: Personality = { ...NEUTRAL, empathy: 100 };
    expect(modulateByPersonality(empathic, { trust: -10 }).trust).toBe(-10);
    expect(modulateByPersonality(empathic, { fear: 12 }).fear).toBe(12);
  });

  it('laesst debt unmoduliert — eine Tatsache, keine Empfindung', () => {
    const empathic: Personality = { ...NEUTRAL, empathy: 100 };
    const cold: Personality = { ...NEUTRAL, empathy: 0 };
    expect(modulateByPersonality(empathic, { debt: 7 }).debt).toBe(7);
    expect(modulateByPersonality(cold, { debt: 7 }).debt).toBe(7);
  });

  it('laesst Nulldeltas und fehlende Felder weg', () => {
    expect(modulateByPersonality(NEUTRAL, { trust: 0 })).toEqual({});
    expect(modulateByPersonality(NEUTRAL, {})).toEqual({});
  });
});

describe('RELATIONSHIP_DELTA_TABLE — jeder Eintrag liefert etwas in mindestens eine Richtung', () => {
  for (const [type, pair] of Object.entries(RELATIONSHIP_DELTA_TABLE)) {
    it(`${type}: mindestens eine Richtung ist nicht leer`, () => {
      expect(pair!.actorToTarget ?? pair!.targetToActor).toBeDefined();
      const total = Object.keys(pair!.actorToTarget ?? {}).length + Object.keys(pair!.targetToActor ?? {}).length;
      expect(total).toBeGreaterThan(0);
    });
  }
});

describe('relationshipEffectsFor', () => {
  function eventOf(type: EventType, actorId: AgentId = A, targetId: AgentId = B) {
    return { ...baseEvent(type, actorId), targetId };
  }

  function eventWithoutTarget(type: EventType, actorId: AgentId = A) {
    return baseEvent(type, actorId);
  }

  function baseEvent(type: EventType, actorId: AgentId) {
    return {
      id: 'event_0001_00000' as const,
      matchId: state.matchId,
      round: state.round,
      seq: 0,
      type,
      actorId,
      locationId: null,
      payload: {},
      visibility: { scope: 'participants' as const },
      infoRefs: [],
    };
  }

  it('erzeugt fuer trade_accepted Effekte in beide Richtungen', () => {
    const effects = relationshipEffectsFor(state, [eventOf('trade_accepted')]);
    expect(effects).toHaveLength(2);
    const fromA = effects.find((e) => e.t === 'relationship' && e.from === A && e.to === B);
    const fromB = effects.find((e) => e.t === 'relationship' && e.from === B && e.to === A);
    expect(fromA).toBeDefined();
    expect(fromB).toBeDefined();
  });

  it('R9 woertlich: information_refused erhoeht suspicion und senkt trust NUR beim Fragenden', () => {
    // actorId = Antwortender, targetId = Fragender (siehe requestInformation.ts).
    const effects = relationshipEffectsFor(state, [eventOf('information_refused')]);
    expect(effects).toHaveLength(1);
    const only = effects[0]!;
    expect(only).toMatchObject({ t: 'relationship', from: B, to: A });
    if (only.t === 'relationship') {
      expect(only.delta.suspicion).toBeGreaterThan(0);
      expect(only.delta.trust).toBeLessThan(0);
    }
  });

  it('ignoriert Ereignisse ohne Eintrag in der Tabelle', () => {
    expect(relationshipEffectsFor(state, [eventOf('agent_moved')])).toEqual([]);
  });

  it('ignoriert Ereignisse ohne targetId', () => {
    expect(relationshipEffectsFor(state, [eventWithoutTarget('trade_accepted')])).toEqual([]);
  });

  it('bewertet niemanden mehr, der in dieser Runde schon gefallen ist', () => {
    state.agents[B]!.alive = false;
    expect(relationshipEffectsFor(state, [eventOf('trade_accepted')])).toEqual([]);
  });

  it('trade_countered ist ein Marker, kein eigener Ausgang, aber nicht folgenlos', () => {
    const effects = relationshipEffectsFor(state, [eventOf('trade_countered')]);
    expect(effects.length).toBeGreaterThan(0);
  });
});

describe('StateMutator — case relationship', () => {
  it('legt beim ersten Kontakt einen neutralen Datensatz an und verschiebt ihn', () => {
    applyEffects(state, [effect.relationship(A, B, { trust: 10 }, 'trade_accepted')]);
    const rel = relationshipOf(state, A, B);
    expect(rel.trust).toBe(10);
    expect(rel.interactions).toBe(1);
    expect(rel.lastInteractionRound).toBe(state.round);
    expect(rel.lastEventTypes).toEqual(['trade_accepted']);
  });

  it('ist gerichtet — die Gegenrichtung bleibt unberuehrt', () => {
    applyEffects(state, [effect.relationship(A, B, { trust: 10 }, 'trade_accepted')]);
    expect(relationshipOf(state, B, A)).toEqual(defaultRelationship());
  });

  it('summiert wiederholte Kontakte und zaehlt interactions mit', () => {
    applyEffects(state, [
      effect.relationship(A, B, { trust: 5 }, 'trade_accepted'),
      effect.relationship(A, B, { trust: 5 }, 'trade_accepted'),
    ]);
    const rel = relationshipOf(state, A, B);
    expect(rel.trust).toBe(10);
    expect(rel.interactions).toBe(2);
  });

  it('klemmt die sieben Stat-Dimensionen auf 0..100', () => {
    applyEffects(state, [effect.relationship(A, B, { trust: 200 }, 'trade_accepted')]);
    expect(relationshipOf(state, A, B).trust).toBe(100);
    applyEffects(state, [effect.relationship(A, B, { trust: -500 }, 'trade_declined')]);
    expect(relationshipOf(state, A, B).trust).toBe(0);
  });

  it('laesst debt unbegrenzt und auch negativ — A schuldet B ist moeglich', () => {
    applyEffects(state, [effect.relationship(A, B, { debt: -30 }, 'trade_accepted')]);
    expect(relationshipOf(state, A, B).debt).toBe(-30);
  });

  it('Ringpuffer: haelt hoechstens 5, aeltestes zuerst verdraengt', () => {
    const types: EventType[] = [
      'trade_accepted',
      'trade_declined',
      'trade_countered',
      'information_shared',
      'information_refused',
      'agent_attacked',
    ];
    for (const type of types) {
      applyEffects(state, [effect.relationship(A, B, { trust: 1 }, type)]);
    }
    expect(relationshipOf(state, A, B).lastEventTypes).toEqual(types.slice(1));
  });

  it('wirft bei nicht-ganzzahligem Delta', () => {
    expect(() => applyEffects(state, [effect.relationship(A, B, { trust: 1.5 }, 'trade_accepted')])).toThrow();
  });

  it('wirft, wenn einer der beiden Agenten nicht existiert', () => {
    expect(() =>
      applyEffects(state, [effect.relationship(A, 'agent_999' as AgentId, { trust: 1 }, 'trade_accepted')]),
    ).toThrow();
  });
});

describe('relationshipOf', () => {
  it('liefert den neutralen Datensatz statt undefined', () => {
    expect(relationshipOf(state, A, B)).toEqual(defaultRelationship());
  });
});
