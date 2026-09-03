import { beforeEach, describe, expect, it } from 'vitest';

import { tradeAction } from '@/engine/actions/defs/trade.js';
import type { ActionContext } from '@/engine/actions/types.js';
import { resolveConfig } from '@/engine/core/config.js';
import { createEventLog } from '@/engine/core/eventLog.js';
import { defaultRelationship } from '@/engine/core/relationship.js';
import { createRngBundle } from '@/engine/core/rng.js';
import type { AgentAction, AgentId, JsonValue, WorldState } from '@/engine/core/types.js';
import { applyEffects } from '@/engine/mutation/stateMutator.js';
import { EffectProjection } from '@/engine/validation/validateAction.js';
import { initWorld } from '@/engine/world/initWorld.js';

const A: AgentId = 'agent_000';
const B: AgentId = 'agent_001';
const FAR: AgentId = 'agent_002';
const OTHER_FAR: AgentId = 'agent_003';

let state: WorldState;
let ctx: ActionContext;

function makeCtx(current: WorldState): ActionContext {
  return {
    state: current,
    round: current.round,
    rng: createRngBundle(13),
    projection: new EffectProjection(current),
    log: createEventLog(current.matchId),
  };
}

/** Personalitaet mit gleichmaessig 50 auf jeder Achse — nicht besonders gierig oder grosszuegig. */
function neutralPersonality() {
  return {
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
}

beforeEach(() => {
  state = initWorld(resolveConfig({ seed: 13, agentCount: 4 })).state;
  for (const id of [A, B]) {
    state.agents[id]!.location = 'commons';
    state.agents[id]!.personality = neutralPersonality();
  }
  state.agents[FAR]!.location = 'outskirts';
  state.agents[OTHER_FAR]!.location = 'outskirts';
  ctx = makeCtx(state);
});

const action = (params: Record<string, JsonValue>): AgentAction => ({
  actorId: A,
  type: 'trade',
  params,
  source: 'scripted',
});

const offer = (target: AgentId, give: Record<string, number>, want: Record<string, number>) =>
  action({ target, give: give as unknown as JsonValue, want: want as unknown as JsonValue });

describe('generate', () => {
  it('bietet nichts an, ohne Ueberschuss', () => {
    state.agents[A]!.resources = { food: 3, coins: 5, materials: 1 };
    expect(tradeAction.generate(state.agents[A]!, ctx)).toEqual([]);
  });

  it('bietet den groessten Ueberschuss fuer den groessten Mangel an', () => {
    state.agents[A]!.resources = { food: 30, coins: 5, materials: 1 };
    const candidates = tradeAction.generate(state.agents[A]!, ctx);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.params['give']).toEqual({ food: 3 });
    // coins(5) liegt weiter unter der Schwelle als materials(1) relativ zu
    // deren jeweiligen Schwellen (30 vs. 12) — materials hat den groesseren
    // absoluten Mangel (12-1=11 gegen 30-5=25)? Nein: 30 Schwelle fuer coins
    // ist groesser, absolut fehlt also mehr. Die Aktion bewertet absolut.
    expect(candidates[0]!.params['want']).toEqual({ coins: expect.any(Number) });
  });

  it('bietet niemandem etwas an, der nicht am selben Ort steht', () => {
    state.agents[A]!.resources = { food: 30, coins: 5, materials: 1 };
    state.agents[B]!.location = 'outskirts';
    expect(tradeAction.generate(state.agents[A]!, ctx)).toEqual([]);
  });
});

describe('precondition', () => {
  beforeEach(() => {
    state.agents[A]!.resources = { food: 10, coins: 10, materials: 10 };
  });

  it('lehnt fehlende Parameter ab', () => {
    expect(tradeAction.precondition(action({ target: B }), ctx)).toMatchObject({ ok: false, reason: 'schema_invalid' });
  });

  it('lehnt ein leeres Angebot oder eine leere Forderung ab', () => {
    expect(tradeAction.precondition(offer(B, {}, { coins: 1 }), ctx)).toMatchObject({ ok: false, reason: 'schema_invalid' });
    expect(tradeAction.precondition(offer(B, { food: 1 }, {}), ctx)).toMatchObject({ ok: false, reason: 'schema_invalid' });
  });

  it('lehnt ab, wenn Angebot und Forderung dieselbe Ressourcenart nennen', () => {
    expect(tradeAction.precondition(offer(B, { food: 1 }, { food: 1 }), ctx)).toMatchObject({
      ok: false,
      reason: 'schema_invalid',
    });
  });

  it('lehnt Selbsthandel ab', () => {
    expect(tradeAction.precondition(offer(A, { food: 1 }, { coins: 1 }), ctx)).toMatchObject({
      ok: false,
      reason: 'target_invalid',
    });
  });

  it('lehnt ein Ziel an einem anderen Ort ab', () => {
    expect(tradeAction.precondition(offer(FAR, { food: 1 }, { coins: 1 }), ctx)).toMatchObject({
      ok: false,
      reason: 'target_invalid',
    });
  });

  it('lehnt ein Angebot ab, das der Anbieter nicht decken kann', () => {
    expect(tradeAction.precondition(offer(B, { food: 999 }, { coins: 1 }), ctx)).toMatchObject({
      ok: false,
      reason: 'insufficient_resources',
    });
  });

  it('akzeptiert ein gueltiges Angebot', () => {
    expect(tradeAction.precondition(offer(B, { food: 3 }, { coins: 1 }), ctx)).toEqual({ ok: true });
  });
});

describe('resolve — klare Faelle', () => {
  beforeEach(() => {
    state.agents[A]!.resources = { food: 10, coins: 10, materials: 10 };
    state.agents[B]!.resources = { food: 10, coins: 50, materials: 10 };
  });

  it('nimmt ein deutlich vorteilhaftes Angebot an', () => {
    // 10 Food (Wert 12) gegen 5 Coins (Wert 2) — weit ueber jeder Schwelle.
    const { effects, events } = tradeAction.resolve(offer(B, { food: 10 }, { coins: 5 }), ctx);
    expect(events[0]).toMatchObject({ type: 'trade_accepted', actorId: A, targetId: B });
    expect(effects).toContainEqual({ t: 'resource', agentId: A, delta: { food: -10, coins: 5 } });
    expect(effects).toContainEqual({ t: 'resource', agentId: B, delta: { food: 10, coins: -5 } });
  });

  it('lehnt ein deutlich unvorteilhaftes Angebot direkt ab, ohne Gegenofferte', () => {
    // 1 Food (Wert 1.2) gegen 30 Coins (Wert 12) — weit unter der Gegenzone.
    const { effects, events } = tradeAction.resolve(offer(B, { food: 1 }, { coins: 30 }), ctx);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'trade_declined', actorId: A, targetId: B });
    expect(effects).toEqual([]);
  });

  it('erhaelt den Gesamtbestand — nichts entsteht, nichts verschwindet', () => {
    const before = {
      food: state.agents[A]!.resources.food + state.agents[B]!.resources.food,
      coins: state.agents[A]!.resources.coins + state.agents[B]!.resources.coins,
    };
    const { effects } = tradeAction.resolve(offer(B, { food: 10 }, { coins: 5 }), ctx);
    applyEffects(state, effects);
    expect(state.agents[A]!.resources.food + state.agents[B]!.resources.food).toBe(before.food);
    expect(state.agents[A]!.resources.coins + state.agents[B]!.resources.coins).toBe(before.coins);
  });
});

describe('resolve — Verhandlungszone', () => {
  beforeEach(() => {
    state.agents[A]!.resources = { food: 10, coins: 10, materials: 10 };
    // Genug Coins, um jede Gegenofferte decken zu koennen.
    state.agents[B]!.resources = { food: 10, coins: 50, materials: 10 };
  });

  it('sendet bei einer knappen, aber nicht hoffnungslosen Forderung eine Gegenofferte', () => {
    // 5 Food (Wert 6.0) gegen 15 Coins (Wert 6.0) — glatt fair (Verhaeltnis 1.0),
    // bei neutraler Persoenlichkeit (Schwelle > 1.0) liegt das in der Gegenzone.
    const { events } = tradeAction.resolve(offer(B, { food: 5 }, { coins: 15 }), ctx);
    expect(events.some((e) => e.type === 'trade_countered')).toBe(true);
    const counter = events.find((e) => e.type === 'trade_countered')!;
    const counterWant = (counter.payload['want'] as Record<string, number>)['coins']!;
    expect(counterWant).toBeLessThan(15);
    expect(counterWant).toBeGreaterThan(0);
  });

  it('nimmt die eigene Gegenofferte an, wenn der urspruengliche Anbieter grosszuegig UND vertrauensvoll ist', () => {
    state.agents[A]!.personality = { ...neutralPersonality(), ambition: 0, manipulation: 0, empathy: 100 };
    state.agents[A]!.relationships[B] = { ...defaultRelationship(), trust: 100 };

    const { effects, events } = tradeAction.resolve(offer(B, { food: 5 }, { coins: 15 }), ctx);
    expect(events.map((e) => e.type)).toEqual(['trade_countered', 'trade_accepted']);
    const accepted = events.find((e) => e.type === 'trade_accepted')!;
    const acceptedWant = (accepted.payload['want'] as Record<string, number>)['coins']!;
    expect(acceptedWant).toBeLessThan(15);
    expect(effects).toContainEqual({ t: 'resource', agentId: A, delta: { food: -5, coins: acceptedWant } });
  });

  it('lehnt die eigene Gegenofferte ab, wenn der urspruengliche Anbieter dabei bleibt, was fair fuer IHN ist', () => {
    // Beide neutral: das Gegenangebot ist fair fuer B, aber schlechter als
    // fair fuer A — bei gleicher Persoenlichkeit reicht das A nicht.
    const { effects, events } = tradeAction.resolve(offer(B, { food: 5 }, { coins: 15 }), ctx);
    expect(events.map((e) => e.type)).toEqual(['trade_countered', 'trade_declined']);
    expect(effects).toEqual([]);
  });

  it('lehnt ab, wenn das Ziel die Gegenofferte selbst nicht decken kann', () => {
    state.agents[B]!.resources.coins = 0;
    const { effects, events } = tradeAction.resolve(offer(B, { food: 5 }, { coins: 15 }), ctx);
    expect(events.every((e) => e.type !== 'trade_accepted')).toBe(true);
    expect(effects).toEqual([]);
  });
});

describe('Persoenlichkeit und Vertrauen', () => {
  it('macht gierige Agenten waehlerischer als grosszuegige — dasselbe Angebot, andere Antwort', () => {
    state.agents[A]!.resources = { food: 10, coins: 10, materials: 10 };
    state.agents[B]!.resources = { food: 10, coins: 50, materials: 10 };

    // Verhaeltnis 0.83 — zwischen der Schwelle eines grosszuegigen (0.7) und
    // eines gierigen Agenten (1.5). Derselbe Anbieter (A, neutral), derselbe
    // Vorschlag — nur Bs Persoenlichkeit unterscheidet sich.
    const marginalOffer = offer(B, { food: 5 }, { coins: 18 });

    state.agents[B]!.personality = { ...neutralPersonality(), ambition: 0, manipulation: 0, empathy: 100 };
    const generous = tradeAction.resolve(marginalOffer, ctx);
    expect(generous.events).toHaveLength(1);
    expect(generous.events[0]!.type).toBe('trade_accepted');

    state.agents[B]!.personality = { ...neutralPersonality(), ambition: 100, manipulation: 100, empathy: 0 };
    const greedy = tradeAction.resolve(marginalOffer, ctx);
    expect(greedy.events.map((e) => e.type)).toEqual(['trade_countered', 'trade_declined']);
  });

  it('senkt die Schwelle bei bestehendem Vertrauen — dieselbe Persoenlichkeit, anderes Ergebnis', () => {
    state.agents[A]!.resources = { food: 10, coins: 10, materials: 10 };
    state.agents[B]!.resources = { food: 10, coins: 50, materials: 10 };
    const marginalOffer = offer(B, { food: 5 }, { coins: 18 });

    // Neutrale Persoenlichkeit auf beiden Seiten (Schwelle ~1.10) — ohne
    // Vertrauen liegt 0.83 in der Gegenzone, nicht ueber der Schwelle.
    const stranger = tradeAction.resolve(marginalOffer, ctx);
    expect(stranger.events[0]!.type).toBe('trade_countered');

    state.agents[B]!.relationships[A] = { ...defaultRelationship(), trust: 100 };
    const trusted = tradeAction.resolve(marginalOffer, ctx);
    expect(trusted.events).toHaveLength(1);
    expect(trusted.events[0]!.type).toBe('trade_accepted');
  });
});
