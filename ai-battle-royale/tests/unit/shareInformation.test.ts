import { beforeEach, describe, expect, it } from 'vitest';

import { shareInformationAction } from '@/engine/actions/defs/shareInformation.js';
import type { ActionContext } from '@/engine/actions/types.js';
import { resolveConfig } from '@/engine/core/config.js';
import { createEventLog } from '@/engine/core/eventLog.js';
import { createRngBundle } from '@/engine/core/rng.js';
import type { AgentAction, AgentId, WorldState } from '@/engine/core/types.js';
import { stockInfoId } from '@/engine/information/infoRegistry.js';
import { effectiveCertainty, observedEntry } from '@/engine/information/knowledge.js';
import { effect } from '@/engine/mutation/effects.js';
import { applyEffects } from '@/engine/mutation/stateMutator.js';
import { EffectProjection } from '@/engine/validation/validateAction.js';
import { initWorld } from '@/engine/world/initWorld.js';

const A: AgentId = 'agent_000';
const B: AgentId = 'agent_001';
const FAR: AgentId = 'agent_002';

const infoId = stockInfoId('warehouse', 'food');

let state: WorldState;
let ctx: ActionContext;

function makeCtx(current: WorldState): ActionContext {
  return {
    state: current,
    round: current.round,
    rng: createRngBundle(9),
    projection: new EffectProjection(current),
    log: createEventLog(current.matchId),
  };
}

beforeEach(() => {
  state = initWorld(resolveConfig({ seed: 9, agentCount: 4 })).state;
  for (const id of [A, B]) state.agents[id]!.location = 'commons';
  state.agents[FAR]!.location = 'outskirts';
  ctx = makeCtx(state);
});

function teach(agentId: AgentId, believedValue: number, lastConfirmedRound?: number): void {
  applyEffects(state, [
    effect.knowledge(
      agentId,
      observedEntry({
        infoId,
        believedValue,
        round: lastConfirmedRound ?? state.round,
        source: 'observed',
        sourceEventId: 'event_0001_00000',
      }),
    ),
  ]);
}

const action = (patch: Partial<AgentAction> = {}): AgentAction => ({
  actorId: A,
  type: 'share_information',
  params: { target: B },
  source: 'scripted',
  ...patch,
});

describe('generate', () => {
  it('bietet nichts an, solange der Agent nichts weiss', () => {
    expect(shareInformationAction.generate(state.agents[A]!, ctx)).toEqual([]);
  });

  it('bietet die zuletzt bestaetigte Ueberzeugung an, mit vollem Statement', () => {
    teach(A, 20);
    const candidates = shareInformationAction.generate(state.agents[A]!, ctx);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.params['target']).toBe(B);
    expect(candidates[0]!.statement).toMatchObject({ kind: 'assert_fact', infoId });
  });

  it('bietet niemandem etwas an, der nicht am selben Ort steht', () => {
    teach(A, 20);
    state.agents[B]!.location = 'outskirts';
    const candidates = shareInformationAction.generate(state.agents[A]!, ctx);
    expect(candidates.map((c) => c.params['target'])).not.toContain(B);
  });
});

describe('precondition', () => {
  it('verlangt ein Statement — Pflichtfeld', () => {
    teach(A, 20);
    const verdict = shareInformationAction.precondition(action(), ctx);
    expect(verdict).toMatchObject({ ok: false, reason: 'precondition_failed' });
  });

  it('lehnt ein Ziel ausserhalb des eigenen Ortes ab', () => {
    teach(A, 20);
    const verdict = shareInformationAction.precondition(
      action({ params: { target: FAR }, statement: { kind: 'assert_fact', infoId, disclosure: { mode: 'exact', value: 20 } } }),
      ctx,
    );
    expect(verdict).toMatchObject({ ok: false, reason: 'target_invalid' });
  });

  it('akzeptiert ein legales, informatives Statement', () => {
    teach(A, 20);
    const verdict = shareInformationAction.precondition(
      action({ statement: { kind: 'assert_fact', infoId, disclosure: { mode: 'exact', value: 20 } } }),
      ctx,
    );
    expect(verdict).toEqual({ ok: true });
  });
});

describe('resolve', () => {
  it('erzeugt beim Ziel einen told_by-Eintrag mit reduzierter Sicherheit', () => {
    teach(A, 20);
    const statement = shareInformationAction.generate(state.agents[A]!, ctx)[0]!.statement!;
    const resolved = shareInformationAction.resolve(action({ statement }), ctx);
    applyEffects(state, resolved.effects);

    const entry = state.agents[B]!.knowledge[infoId];
    expect(entry).toBeDefined();
    expect(entry!.source).toBe('told_by');
    expect(entry!.sourceAgent).toBe(A);
    expect(entry!.believedValue).toBe(20);
    // A hatte Sicherheit 1.0, hearsayRetention ist 0.7.
    expect(entry!.certainty).toBeCloseTo(0.7);
  });

  it('haelt fest, wem der Sender schon erzaehlt hat', () => {
    teach(A, 20);
    const statement = shareInformationAction.generate(state.agents[A]!, ctx)[0]!.statement!;
    const resolved = shareInformationAction.resolve(action({ statement }), ctx);
    applyEffects(state, resolved.effects);
    expect(state.agents[A]!.knowledge[infoId]!.sharedWith).toEqual([B]);
  });

  it('verwirft eine schwaechere Version nicht das bessere Wissen des Ziels', () => {
    teach(A, 5); // A hat nur eine schwache/alte Ueberzeugung
    teach(B, 20); // B hat besseres, eigenes Wissen (certainty 1.0)
    const statement = shareInformationAction.generate(state.agents[A]!, ctx)[0]!.statement!;
    const resolved = shareInformationAction.resolve(action({ statement }), ctx);
    applyEffects(state, resolved.effects);

    // 0.7 (hearsayRetention) < 1.0 (Bs eigene Sicherheit) — B behaelt seins.
    expect(state.agents[B]!.knowledge[infoId]!.believedValue).toBe(20);
    expect(state.agents[B]!.knowledge[infoId]!.source).toBe('observed');
  });

  it('setzt einen aufloesbaren sourceEventId', () => {
    teach(A, 20);
    const statement = shareInformationAction.generate(state.agents[A]!, ctx)[0]!.statement!;
    const resolved = shareInformationAction.resolve(action({ statement }), ctx);
    applyEffects(state, resolved.effects);

    const entry = state.agents[B]!.knowledge[infoId]!;
    expect(entry.sourceEventId).toBeDefined();
    const event = ctx.log.append(resolved.events[0]!);
    expect(event.id).toBe(entry.sourceEventId);
  });

  it('das Event traegt keine infoRefs — sonst wuerde Phase 2 die Wahrheit an alle verteilen', () => {
    teach(A, 20);
    const statement = shareInformationAction.generate(state.agents[A]!, ctx)[0]!.statement!;
    const resolved = shareInformationAction.resolve(action({ statement }), ctx);
    expect(resolved.events[0]!.infoRefs).toEqual([]);
  });

  it('gibt niemals mehr Sicherheit weiter als der Sender selbst hatte, auch nach Verfall', () => {
    teach(A, 20, 1);
    state.round = 20;
    ctx = makeCtx(state);
    const senderCertaintyBefore = effectiveCertainty(
      state.agents[A]!.knowledge[infoId]!,
      state.infoRegistry[infoId]!,
      20,
      state.config.info,
    );
    const statement = shareInformationAction.generate(state.agents[A]!, ctx)[0]!.statement!;
    const resolved = shareInformationAction.resolve(action({ statement }), ctx);
    applyEffects(state, resolved.effects);
    expect(state.agents[B]!.knowledge[infoId]!.certainty).toBeLessThanOrEqual(
      senderCertaintyBefore * state.config.info.hearsayRetention + 1e-9,
    );
  });
});
