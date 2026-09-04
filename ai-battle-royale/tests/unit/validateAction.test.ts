import { beforeEach, describe, expect, it } from 'vitest';

import { restAction } from '@/engine/actions/defs/rest.js';
import type { ActionContext } from '@/engine/actions/types.js';
import { resolveConfig } from '@/engine/core/config.js';
import { createEventLog } from '@/engine/core/eventLog.js';
import { createRngBundle } from '@/engine/core/rng.js';
import type { AgentAction, AgentId, WorldState } from '@/engine/core/types.js';
import { stockInfoId } from '@/engine/information/infoRegistry.js';
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
  ctx = {
    state,
    round: state.round,
    rng: createRngBundle(1),
    projection: new EffectProjection(state),
    log: createEventLog(state.matchId),
  };
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
    const verdict = validateAction(action({ type: 'offer_alliance' }), ctx);
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

describe('needAvailable — der Stand mit dieser Runde bereits eingerechnet', () => {
  it('ohne Effekte gilt der Stand vom Rundenbeginn', () => {
    const projection = new EffectProjection(state);
    expect(projection.needAvailable(A, 'energy')).toBe(state.agents[A]!.needs.energy);
  });

  it('rechnet uebernommene need-Effekte mit ein', () => {
    const projection = new EffectProjection(state);
    projection.commit([effect.need(A, { energy: -30 })]);
    expect(projection.needAvailable(A, 'energy')).toBe(state.agents[A]!.needs.energy - 30);
  });

  it('summiert mehrere Effekte derselben Runde', () => {
    const projection = new EffectProjection(state);
    projection.commit([effect.need(A, { energy: -20 })]);
    projection.commit([effect.need(A, { energy: -15 })]);
    expect(projection.needAvailable(A, 'energy')).toBe(state.agents[A]!.needs.energy - 35);
  });

  it('klemmt auf 0..100 wie der StateMutator', () => {
    const projection = new EffectProjection(state);
    projection.commit([effect.need(A, { energy: -1000 })]);
    expect(projection.needAvailable(A, 'energy')).toBe(0);

    const other = new EffectProjection(state);
    other.commit([effect.need(A, { energy: 1000 })]);
    expect(other.needAvailable(A, 'energy')).toBe(100);
  });

  it('ist pro Agent und pro Beduerfnis getrennt', () => {
    const OTHER: AgentId = 'agent_001';
    const projection = new EffectProjection(state);
    projection.commit([effect.need(A, { energy: -50 })]);
    expect(projection.needAvailable(OTHER, 'energy')).toBe(state.agents[OTHER]!.needs.energy);
    expect(projection.needAvailable(A, 'satiety')).toBe(state.agents[A]!.needs.satiety);
  });
});

describe('Stufe 6 und 7 — Wissen und Wahrheit', () => {
  const infoId = stockInfoId('commons', 'food');

  function teachAgent(believedValue: number, certainty = 1): void {
    state.agents[A]!.knowledge[infoId] = {
      infoId,
      believedValue,
      certainty,
      source: 'observed',
      acquiredRound: state.round,
      lastConfirmedRound: state.round,
      sharedWith: [],
      isSecret: false,
    };
  }

  /**
   * Bis T18 (`share_information`) traegt keine implementierte Aktion ein
   * Statement — `allowsStatement` ist ueberall `false`. Damit die Stufen 6 und 7
   * nicht bis dahin ungetestet in der Kette haengen, dreht dieser Helfer die
   * Erlaubnis fuer die Dauer eines Falls um. Genau dafuer steht das Flag: die
   * Kette selbst kennt keine Aktionsnamen.
   */
  function withStatementsAllowed(run: () => void): void {
    const flag = restAction as { allowsStatement: boolean };
    const original = flag.allowsStatement;
    flag.allowsStatement = true;
    try {
      run();
    } finally {
      flag.allowsStatement = original;
    }
  }

  it('Stufe 6 — eine Aktion ohne Redeerlaubnis traegt kein Statement', () => {
    teachAgent(10);
    const verdict = validateAction(
      action({ statement: { kind: 'assert_fact', infoId, disclosure: { mode: 'existence_only' } } }),
      ctx,
    );
    expect(verdict).toMatchObject({ ok: false, reason: 'precondition_failed' });
  });

  it('Stufe 1 — ein formal kaputtes Statement faellt schon am Schema', () => {
    withStatementsAllowed(() => {
      const verdict = validateAction(
        // `partial_disclosure` ist laut Doc 03 §3.4.3 stets unpraezise.
        action({
          statement: { kind: 'partial_disclosure', infoId, disclosure: { mode: 'exact', value: 10 } },
        }),
        ctx,
      );
      expect(verdict).toMatchObject({ ok: false, reason: 'schema_invalid' });
    });
  });

  it('Stufe 7 — eine wahre Aussage geht durch', () => {
    teachAgent(10);
    withStatementsAllowed(() => {
      const verdict = validateAction(
        action({ statement: { kind: 'assert_fact', infoId, disclosure: { mode: 'existence_only' } } }),
        ctx,
      );
      expect(verdict).toEqual({ ok: true });
    });
  });

  it('Stufe 7 — eine Luege wird mit ihrem Wahrheitsgrund abgelehnt', () => {
    teachAgent(10);
    withStatementsAllowed(() => {
      const verdict = validateAction(
        action({ statement: { kind: 'assert_fact', infoId, disclosure: { mode: 'exact', value: 99 } } }),
        ctx,
      );
      expect(verdict).toMatchObject({ ok: false, reason: 'false_assertion' });
    });
  });

  it('Stufe 7 — Reden ueber Unbekanntes ist unknown_reference, keine Luege', () => {
    withStatementsAllowed(() => {
      const verdict = validateAction(
        action({ statement: { kind: 'assert_absence', infoId } }),
        ctx,
      );
      expect(verdict).toMatchObject({ ok: false, reason: 'unknown_reference' });
    });
  });

  it('Stufe 7 — Verweigerung geht auch ohne jedes Wissen durch (R9)', () => {
    withStatementsAllowed(() => {
      const verdict = validateAction(
        action({ statement: { kind: 'refuse_to_answer', topic: 'stock_at_location' } }),
        ctx,
      );
      expect(verdict).toEqual({ ok: true });
    });
  });

  it('die Reihenfolge haelt: Stufe 2 schlaegt Stufe 7', () => {
    // Ein ausgeschiedener Agent mit einer Luege im Mund wird als Toter
    // abgelehnt, nicht als Luegner. Der erste Fehler bricht ab (Doc 08 §8.1).
    state.agents[A]!.alive = false;
    withStatementsAllowed(() => {
      const verdict = validateAction(
        action({ statement: { kind: 'assert_fact', infoId, disclosure: { mode: 'exact', value: 99 } } }),
        ctx,
      );
      expect(verdict).toMatchObject({ ok: false, reason: 'actor_invalid' });
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
