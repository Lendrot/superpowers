import { beforeEach, describe, expect, it } from 'vitest';

import { offerAllianceAction } from '@/engine/actions/defs/offerAlliance.js';
import type { ActionContext } from '@/engine/actions/types.js';
import { resolveConfig } from '@/engine/core/config.js';
import { createEventLog } from '@/engine/core/eventLog.js';
import { createRngBundle } from '@/engine/core/rng.js';
import type { Alliance, AgentAction, AgentId, AllianceId, JsonValue, WorldState } from '@/engine/core/types.js';
import { applyEffects } from '@/engine/mutation/stateMutator.js';
import { EffectProjection } from '@/engine/validation/validateAction.js';
import { initWorld } from '@/engine/world/initWorld.js';

const A: AgentId = 'agent_000';
const B: AgentId = 'agent_001';
const C: AgentId = 'agent_002';
const FAR: AgentId = 'agent_003';

let state: WorldState;
let ctx: ActionContext;

function makeCtx(current: WorldState): ActionContext {
  return {
    state: current,
    round: current.round,
    rng: createRngBundle(19),
    projection: new EffectProjection(current),
    log: createEventLog(current.matchId),
  };
}

/** Personalitaet mit gleichmaessig 50 auf jeder Achse. */
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
  state = initWorld(resolveConfig({ seed: 19, agentCount: 4 })).state;
  for (const id of [A, B, C]) {
    state.agents[id]!.location = 'commons';
    state.agents[id]!.personality = neutralPersonality();
  }
  state.agents[FAR]!.location = 'outskirts';
  ctx = makeCtx(state);
});

const action = (actorId: AgentId, params: Record<string, JsonValue>): AgentAction => ({
  actorId,
  type: 'offer_alliance',
  params,
  source: 'scripted',
});

function makeAlliance(id: AllianceId, leaderId: AgentId, members: AgentId[]): Alliance {
  return {
    id,
    name: 'Test-Allianz',
    founderId: leaderId,
    members: [...members].sort(),
    leaderId,
    sharedStock: { food: 0, coins: 0, materials: 0 },
    createdRound: 1,
  };
}

describe('generate', () => {
  it('bietet allen allianzlosen Agenten am selben Ort an', () => {
    const candidates = offerAllianceAction.generate(state.agents[A]!, ctx);
    expect(candidates.map((c) => c.params['target']).sort()).toEqual([B, C]);
  });

  it('bietet niemandem etwas an, der schon in einer Allianz ist', () => {
    const alliance = makeAlliance('alliance_0001_00000', C, [C, FAR]);
    state.alliances[alliance.id] = alliance;
    state.agents[C]!.allianceId = alliance.id;
    ctx = makeCtx(state);

    const candidates = offerAllianceAction.generate(state.agents[A]!, ctx);
    expect(candidates.map((c) => c.params['target'])).toEqual([B]);
  });

  it('bietet nichts an, wer selbst Mitglied (nicht Leader) einer Allianz ist', () => {
    const alliance = makeAlliance('alliance_0001_00000', B, [A, B]);
    state.alliances[alliance.id] = alliance;
    state.agents[A]!.allianceId = alliance.id;
    state.agents[B]!.allianceId = alliance.id;
    ctx = makeCtx(state);

    expect(offerAllianceAction.generate(state.agents[A]!, ctx)).toEqual([]);
  });

  it('bietet nichts an, wenn die eigene Allianz als Leader schon voll ist', () => {
    const config = resolveConfig({ seed: 19, agentCount: 4, alliance: { maxSize: 2 } });
    state = initWorld(config).state;
    for (const id of [A, B, C]) {
      state.agents[id]!.location = 'commons';
      state.agents[id]!.personality = neutralPersonality();
    }
    const alliance = makeAlliance('alliance_0001_00000', A, [A, B]);
    state.alliances[alliance.id] = alliance;
    state.agents[A]!.allianceId = alliance.id;
    state.agents[B]!.allianceId = alliance.id;
    ctx = makeCtx(state);

    expect(offerAllianceAction.generate(state.agents[A]!, ctx)).toEqual([]);
  });

  it('ladet weiter ein, wenn die eigene Allianz als Leader noch Platz hat', () => {
    const alliance = makeAlliance('alliance_0001_00000', A, [A, B]);
    state.alliances[alliance.id] = alliance;
    state.agents[A]!.allianceId = alliance.id;
    state.agents[B]!.allianceId = alliance.id;
    ctx = makeCtx(state);

    const candidates = offerAllianceAction.generate(state.agents[A]!, ctx);
    expect(candidates.map((c) => c.params['target'])).toEqual([C]);
  });
});

describe('precondition', () => {
  it('lehnt fehlende Parameter ab', () => {
    expect(offerAllianceAction.precondition(action(A, {}), ctx)).toMatchObject({ ok: false, reason: 'schema_invalid' });
  });

  it('lehnt Selbsteinladung ab', () => {
    expect(offerAllianceAction.precondition(action(A, { target: A }), ctx)).toMatchObject({
      ok: false,
      reason: 'target_invalid',
    });
  });

  it('lehnt ein Ziel an einem anderen Ort ab', () => {
    expect(offerAllianceAction.precondition(action(A, { target: FAR }), ctx)).toMatchObject({
      ok: false,
      reason: 'target_invalid',
    });
  });

  it('lehnt ein Ziel ab, das schon in einer Allianz ist', () => {
    const alliance = makeAlliance('alliance_0001_00000', C, [C, FAR]);
    state.alliances[alliance.id] = alliance;
    state.agents[C]!.allianceId = alliance.id;
    ctx = makeCtx(state);

    expect(offerAllianceAction.precondition(action(A, { target: C }), ctx)).toMatchObject({
      ok: false,
      reason: 'target_invalid',
    });
  });

  it('lehnt ein einfaches Mitglied als Vorschlagenden ab', () => {
    const alliance = makeAlliance('alliance_0001_00000', B, [A, B]);
    state.alliances[alliance.id] = alliance;
    state.agents[A]!.allianceId = alliance.id;
    state.agents[B]!.allianceId = alliance.id;
    ctx = makeCtx(state);

    expect(offerAllianceAction.precondition(action(A, { target: C }), ctx)).toMatchObject({
      ok: false,
      reason: 'precondition_failed',
    });
  });

  it('akzeptiert eine gueltige Einladung', () => {
    expect(offerAllianceAction.precondition(action(A, { target: B }), ctx)).toEqual({ ok: true });
  });
});

describe('resolve', () => {
  it('gruendet eine neue Allianz, wenn beide vorher allianzlos sind und das Ziel annimmt', () => {
    state.agents[B]!.relationships[A] = {
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

    const result = offerAllianceAction.resolve(action(A, { target: B }), ctx);
    expect(result.events[0]!.type).toBe('alliance_offer_accepted');
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toMatchObject({ t: 'alliance', op: 'create', founderId: A, joinerId: B });

    applyEffects(state, result.effects);
    expect(state.agents[A]!.allianceId).toBe(state.agents[B]!.allianceId);
    const alliance = state.alliances[state.agents[A]!.allianceId!]!;
    expect(alliance.leaderId).toBe(A);
    expect(alliance.members).toEqual([A, B].sort());
  });

  it('lehnt ab, wenn das Vertrauen des Ziels zu gering ist', () => {
    state.agents[B]!.personality = { ...neutralPersonality(), dominance: 100 };

    const result = offerAllianceAction.resolve(action(A, { target: B }), ctx);
    expect(result.events[0]!.type).toBe('alliance_offer_declined');
    expect(result.effects).toEqual([]);
  });

  it('lasst ein Mitglied einer bestehenden Allianz beitreten', () => {
    const alliance = makeAlliance('alliance_0001_00000', A, [A, B]);
    state.alliances[alliance.id] = alliance;
    state.agents[A]!.allianceId = alliance.id;
    state.agents[B]!.allianceId = alliance.id;
    state.agents[C]!.relationships[A] = {
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
    ctx = makeCtx(state);

    const result = offerAllianceAction.resolve(action(A, { target: C }), ctx);
    expect(result.effects).toEqual([{ t: 'alliance', op: 'join', id: alliance.id, agentId: C }]);

    applyEffects(state, result.effects);
    expect(state.alliances[alliance.id]!.members).toEqual([A, B, C].sort());
  });

  it('live: lehnt ab, wenn das Ziel in derselben Runde schon anderswo Mitglied wurde', () => {
    // A wirbt gleichzeitig um C — B ist schneller und bindet C in dieser
    // Runde bereits an sich, bevor As Angebot aufgeloest wird.
    state.agents[C]!.relationships[B] = {
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
    const fromB = offerAllianceAction.resolve(action(B, { target: C }), ctx);
    expect(fromB.events[0]!.type).toBe('alliance_offer_accepted');
    ctx.projection.commit(fromB.effects);

    const fromA = offerAllianceAction.resolve(action(A, { target: C }), ctx);
    expect(fromA.events[0]!.type).toBe('alliance_offer_declined');
    expect(fromA.effects).toEqual([]);
  });
});
