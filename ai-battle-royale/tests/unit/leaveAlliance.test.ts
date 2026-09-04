import { beforeEach, describe, expect, it } from 'vitest';

import { leaveAllianceAction } from '@/engine/actions/defs/leaveAlliance.js';
import { expelMemberAction } from '@/engine/actions/defs/expelMember.js';
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
const ALLIANCE: AllianceId = 'alliance_0001_00000';

let state: WorldState;
let ctx: ActionContext;

function makeCtx(current: WorldState): ActionContext {
  return {
    state: current,
    round: current.round,
    rng: createRngBundle(23),
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

const leaveAction = (actorId: AgentId): AgentAction => ({
  actorId,
  type: 'leave_alliance',
  params: {},
  source: 'scripted',
});

beforeEach(() => {
  state = initWorld(resolveConfig({ seed: 23, agentCount: 4 })).state;
  const alliance = makeAlliance(ALLIANCE, A, [A, B, C]);
  state.alliances[ALLIANCE] = alliance;
  for (const id of [A, B, C]) state.agents[id]!.allianceId = ALLIANCE;
  ctx = makeCtx(state);
});

describe('generate', () => {
  it('bietet den Austritt an, wer in einer Allianz ist', () => {
    expect(leaveAllianceAction.generate(state.agents[B]!, ctx)).toHaveLength(1);
  });

  it('bietet nichts an, wer in keiner Allianz ist', () => {
    state.agents[B]!.allianceId = null;
    ctx = makeCtx(state);
    expect(leaveAllianceAction.generate(state.agents[B]!, ctx)).toEqual([]);
  });
});

describe('precondition', () => {
  it('lehnt ab, wer in keiner Allianz ist', () => {
    state.agents[B]!.allianceId = null;
    ctx = makeCtx(state);
    expect(leaveAllianceAction.precondition(leaveAction(B), ctx)).toMatchObject({
      ok: false,
      reason: 'precondition_failed',
    });
  });

  it('akzeptiert ein Mitglied', () => {
    expect(leaveAllianceAction.precondition(leaveAction(B), ctx)).toEqual({ ok: true });
  });
});

describe('resolve', () => {
  it('erzeugt den Austritts-Effekt, den Energiepreis und ein Event pro verbleibendem Mitglied', () => {
    const result = leaveAllianceAction.resolve(leaveAction(B), ctx);
    expect(result.effects).toContainEqual({ t: 'alliance', op: 'leave', id: ALLIANCE, agentId: B });
    expect(result.effects).toContainEqual({
      t: 'need',
      agentId: B,
      delta: { energy: -state.config.alliance.exitPenalty },
    });
    expect(result.events).toHaveLength(2);
    const targets = result.events.map((e) => e.targetId).sort();
    expect(targets).toEqual([A, C].sort());
    for (const event of result.events) {
      expect(event.type).toBe('alliance_left');
      expect(event.actorId).toBe(B);
    }
  });

  it('nimmt B aus der Mitgliederliste, der Leader bleibt unveraendert', () => {
    const result = leaveAllianceAction.resolve(leaveAction(B), ctx);
    applyEffects(state, result.effects);
    const alliance = state.alliances[ALLIANCE]!;
    expect(alliance.members).toEqual([A, C].sort());
    expect(alliance.leaderId).toBe(A);
    expect(state.agents[B]!.allianceId).toBeNull();
  });

  it('loest die Allianz auf, wenn nur noch ein lebendes Mitglied uebrig bliebe', () => {
    const twoMember = makeAlliance(ALLIANCE, A, [A, B]);
    state.alliances[ALLIANCE] = twoMember;
    state.agents[C]!.allianceId = null;
    ctx = makeCtx(state);

    const result = leaveAllianceAction.resolve(leaveAction(B), ctx);
    applyEffects(state, result.effects);
    const alliance = state.alliances[ALLIANCE]!;
    expect(alliance.dissolvedRound).toBe(state.round);
    expect(state.agents[A]!.allianceId).toBeNull();
    expect(state.agents[B]!.allianceId).toBeNull();
  });

  it('gibt dem Leader die Fuehrung weiter, wenn der bisherige Leader geht', () => {
    const result = leaveAllianceAction.resolve(leaveAction(A), ctx);
    applyEffects(state, result.effects);
    const alliance = state.alliances[ALLIANCE]!;
    // B < C alphabetisch — deterministischer Tie-Break.
    expect(alliance.leaderId).toBe(B);
  });

  it('live: ein bereits in dieser Runde ausgeschlossenes Mitglied verlaesst nichts mehr', () => {
    // A (Leader) schliesst B in derselben Runde zuerst aus.
    const fromExpel = expelMemberAction.resolve(
      { actorId: A, type: 'expel_member', params: { target: B }, source: 'scripted' },
      ctx,
    );
    ctx.projection.commit(fromExpel.effects);

    const result = leaveAllianceAction.resolve(leaveAction(B), ctx);
    expect(result.effects).toEqual([]);
    expect(result.events).toEqual([]);
  });
});
