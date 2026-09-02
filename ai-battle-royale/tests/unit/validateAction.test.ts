import { beforeEach, describe, expect, it } from 'vitest';

import { createStockLedger } from '@/engine/actions/stockLedger.js';
import type { ActionContext } from '@/engine/actions/types.js';
import { resolveConfig } from '@/engine/core/config.js';
import { createRngBundle } from '@/engine/core/rng.js';
import type { AgentAction, AgentId, WorldState } from '@/engine/core/types.js';
import { effect } from '@/engine/mutation/effects.js';
import { EffectProjection, validateAction } from '@/engine/validation/validateAction.js';
import { emptyRejectCounts, totalRejects } from '@/engine/validation/rejectReasons.js';
import { initWorld } from '@/engine/world/initWorld.js';

const A: AgentId = 'agent_000';

let state: WorldState;
let ctx: ActionContext;

beforeEach(() => {
  state = initWorld(resolveConfig({ seed: 2, agentCount: 4 })).state;
  state.agents[A]!.location = 'commons';
  state.agents[A]!.needs = { satiety: 50, energy: 50 };
  state.agents[A]!.resources = { food: 3, coins: 0, materials: 0 };
  state.locations['commons']!.stock = { food: 10, coins: 0, materials: 4 };
  ctx = { state, round: state.round, rng: createRngBundle(1), ledger: createStockLedger(state) };
});

const action = (patch: Partial<AgentAction> = {}): AgentAction => ({
  actorId: A,
  type: 'rest',
  params: {},
  source: 'scripted',
  ...patch,
});

describe('Validierungskette', () => {
  it('Stufe 1 — Schema: falscher Aktionstyp', () => {
    const verdict = validateAction(action({ type: 'teleport' as AgentAction['type'] }), ctx);
    expect(verdict).toMatchObject({ ok: false, reason: 'schema_invalid' });
  });

  it('Stufe 1 — Schema: falsches AgentId-Muster', () => {
    const verdict = validateAction(action({ actorId: 'AGENT-1' as AgentId }), ctx);
    expect(verdict).toMatchObject({ ok: false, reason: 'schema_invalid' });
  });

  it('Stufe 2 — Identity: unbekannter Agent', () => {
    const verdict = validateAction(action({ actorId: 'agent_999' }), ctx);
    expect(verdict).toMatchObject({ ok: false, reason: 'actor_invalid' });
  });

  it('Stufe 2 — Identity: ausgeschiedener Agent', () => {
    state.agents[A]!.alive = false;
    const verdict = validateAction(action(), ctx);
    expect(verdict).toMatchObject({ ok: false, reason: 'actor_invalid' });
  });

  it('Stufe 2 — nicht implementierte Aktion', () => {
    const verdict = validateAction(action({ type: 'trade' }), ctx);
    expect(verdict).toMatchObject({ ok: false, reason: 'precondition_failed' });
  });

  it('Stufe 2 — Cooldown', () => {
    state.agents[A]!.cooldowns = { rest: state.round + 3 };
    const verdict = validateAction(action(), ctx);
    expect(verdict).toMatchObject({ ok: false, reason: 'precondition_failed' });
  });

  it('Stufe 4 — Precondition der Aktion', () => {
    state.agents[A]!.needs.energy = 0;
    const verdict = validateAction(action({ type: 'gather_resource', params: { resource: 'food' } }), ctx);
    expect(verdict).toMatchObject({ ok: false, reason: 'precondition_failed' });
  });

  it('laesst eine legale Aktion durch', () => {
    expect(validateAction(action(), ctx)).toEqual({ ok: true });
    expect(validateAction(action({ type: 'gather_resource', params: { resource: 'food' } }), ctx)).toEqual({
      ok: true,
    });
  });

  it('rest bleibt legal, wenn alles andere scheitert — sonst gaebe es keinen Fallback', () => {
    state.agents[A]!.needs = { satiety: 0, energy: 0 };
    state.locations['commons']!.stock = { food: 0, coins: 0, materials: 0 };
    expect(validateAction(action(), ctx)).toEqual({ ok: true });
  });
});

describe('Stufe 9 — Effect Sanity', () => {
  it('akzeptiert unkritische Effekte', () => {
    const projection = new EffectProjection(state);
    expect(projection.check([effect.resource(A, { food: 2 })])).toEqual({ ok: true });
  });

  it('lehnt ab, was einen Vorrat unter null druecken wuerde', () => {
    const projection = new EffectProjection(state);
    expect(projection.check([effect.resource(A, { food: -4 })])).toMatchObject({
      ok: false,
      reason: 'insufficient_resources',
    });
  });

  it('beruecksichtigt bereits uebernommene Effekte derselben Runde', () => {
    const projection = new EffectProjection(state);
    projection.commit([effect.resource(A, { food: -3 })]);
    expect(projection.check([effect.resource(A, { food: -1 })])).toMatchObject({ ok: false });
  });

  it('lehnt eine Ueberschreitung der Ortskapazitaet ab', () => {
    const projection = new EffectProjection(state);
    const capacity = state.locations['commons']!.capacity.food;
    expect(projection.check([effect.locationStock('commons', { food: capacity }, 'regen')])).toMatchObject({
      ok: false,
      reason: 'effect_invalid',
    });
  });

  it('lehnt ab, was einen Ortsbestand unter null druecken wuerde', () => {
    const projection = new EffectProjection(state);
    expect(projection.check([effect.locationStock('commons', { food: -11 }, 'transfer')])).toMatchObject({
      ok: false,
      reason: 'effect_invalid',
    });
  });
});

describe('Reject-Zaehler', () => {
  it('startet bei null und summiert ueber alle Gruende', () => {
    const counts = emptyRejectCounts();
    expect(totalRejects(counts)).toBe(0);
    counts.schema_invalid += 2;
    counts.effect_invalid += 1;
    expect(totalRejects(counts)).toBe(3);
  });
});
