import { beforeEach, describe, expect, it } from 'vitest';

import { expelMemberAction } from '@/engine/actions/defs/expelMember.js';
import { leaveAllianceAction } from '@/engine/actions/defs/leaveAlliance.js';
import type { ActionContext } from '@/engine/actions/types.js';
import { resolveConfig } from '@/engine/core/config.js';
import { createEventLog } from '@/engine/core/eventLog.js';
import { createRngBundle } from '@/engine/core/rng.js';
import type { Alliance, AgentAction, AgentId, AllianceId, WorldState } from '@/engine/core/types.js';
import { applyEffects } from '@/engine/mutation/stateMutator.js';
import { EffectProjection } from '@/engine/validation/validateAction.js';
import { initWorld } from '@/engine/world/initWorld.js';

const A: AgentId = 'agent_000';
const B: AgentId = 'agent_001';
const C: AgentId = 'agent_002';
const D: AgentId = 'agent_003';
const ALLIANCE: AllianceId = 'alliance_0001_00000';

let state: WorldState;
let ctx: ActionContext;

function makeCtx(current: WorldState): ActionContext {
  return {
    state: current,
    round: current.round,
    rng: createRngBundle(29),
    projection: new EffectProjection(current),
    log: createEventLog(current.matchId),
  };
}

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

const action = (actorId: AgentId, targetId: AgentId): AgentAction => ({
  actorId,
  type: 'expel_member',
  params: { target: targetId },
  source: 'scripted',
});

beforeEach(() => {
  state = initWorld(resolveConfig({ seed: 29, agentCount: 5 })).state;
  const alliance = makeAlliance(ALLIANCE, A, [A, B, C]);
  state.alliances[ALLIANCE] = alliance;
  for (const id of [A, B, C]) state.agents[id]!.allianceId = ALLIANCE;
  ctx = makeCtx(state);
});

describe('generate', () => {
  it('bietet Ausschluss fuer jedes andere Mitglied an, wenn der Agent Leader ist', () => {
    const candidates = expelMemberAction.generate(state.agents[A]!, ctx);
    expect(candidates.map((c) => c.params['target']).sort()).toEqual([B, C]);
  });

  it('bietet nichts an, wer nicht Leader ist', () => {
    expect(expelMemberAction.generate(state.agents[B]!, ctx)).toEqual([]);
  });

  it('bietet nichts an, wer in keiner Allianz ist', () => {
    expect(expelMemberAction.generate(state.agents[D]!, ctx)).toEqual([]);
  });
});

describe('precondition', () => {
  it('lehnt fehlende Parameter ab', () => {
    expect(
      expelMemberAction.precondition({ actorId: A, type: 'expel_member', params: {}, source: 'scripted' }, ctx),
    ).toMatchObject({ ok: false, reason: 'schema_invalid' });
  });

  it('lehnt Selbstausschluss ab', () => {
    expect(expelMemberAction.precondition(action(A, A), ctx)).toMatchObject({ ok: false, reason: 'target_invalid' });
  });

  it('lehnt einen Nicht-Leader als Ausschliessenden ab', () => {
    expect(expelMemberAction.precondition(action(B, C), ctx)).toMatchObject({
      ok: false,
      reason: 'precondition_failed',
    });
  });

  it('lehnt ein Ziel ab, das nicht Mitglied ist', () => {
    expect(expelMemberAction.precondition(action(A, D), ctx)).toMatchObject({ ok: false, reason: 'target_invalid' });
  });

  it('akzeptiert einen gueltigen Ausschluss', () => {
    expect(expelMemberAction.precondition(action(A, B), ctx)).toEqual({ ok: true });
  });
});

describe('resolve', () => {
  it('schliesst das Mitglied aus und zaehlt exiledFrom', () => {
    const result = expelMemberAction.resolve(action(A, B), ctx);
    expect(result.effects).toEqual([{ t: 'alliance', op: 'expel', id: ALLIANCE, agentId: B }]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ type: 'alliance_expelled', actorId: A, targetId: B });

    applyEffects(state, result.effects);
    expect(state.alliances[ALLIANCE]!.members).toEqual([A, C].sort());
    expect(state.agents[B]!.allianceId).toBeNull();
    expect(state.agents[B]!.status.exiledFrom).toEqual([ALLIANCE]);
  });

  it('live: ein bereits in dieser Runde ausgetretenes Mitglied wird nicht doppelt ausgeschlossen', () => {
    // B verlaesst zuerst freiwillig ...
    const fromLeave = leaveAllianceAction.resolve(
      { actorId: B, type: 'leave_alliance', params: {}, source: 'scripted' },
      ctx,
    );
    ctx.projection.commit(fromLeave.effects);

    // ... A versucht danach in derselben Runde, B trotzdem auszuschliessen.
    const result = expelMemberAction.resolve(action(A, B), ctx);
    expect(result.effects).toEqual([]);
    expect(result.events).toEqual([]);
  });

  it('kann ein bereits gestorbenes Mitglied nachtraeglich ausschliessen', () => {
    state.agents[C]!.alive = false;
    state.agents[C]!.eliminatedRound = 1;
    state.agents[C]!.eliminationCause = 'starvation';
    ctx = makeCtx(state);

    const result = expelMemberAction.resolve(action(A, C), ctx);
    applyEffects(state, result.effects);
    expect(state.alliances[ALLIANCE]!.members).toEqual([A, B].sort());
  });
});
