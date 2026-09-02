import { beforeEach, describe, expect, it } from 'vitest';

import { createStockLedger } from '@/engine/actions/stockLedger.js';
import { consumeAction } from '@/engine/actions/defs/consume.js';
import { gatherResourceAction } from '@/engine/actions/defs/gatherResource.js';
import { moveAction } from '@/engine/actions/defs/move.js';
import { restAction } from '@/engine/actions/defs/rest.js';
import { IMPLEMENTED_ACTIONS, findAction, requireAction } from '@/engine/actions/registry.js';
import type { ActionContext } from '@/engine/actions/types.js';
import { resolveConfig } from '@/engine/core/config.js';
import { createRngBundle } from '@/engine/core/rng.js';
import type { AgentAction, AgentId, WorldState } from '@/engine/core/types.js';
import { canonicalJson } from '@/engine/core/hash.js';
import { initWorld } from '@/engine/world/initWorld.js';

const A: AgentId = 'agent_000';

let state: WorldState;
let ctx: ActionContext;

function makeCtx(current: WorldState): ActionContext {
  return { state: current, round: current.round, rng: createRngBundle(1), ledger: createStockLedger(current) };
}

beforeEach(() => {
  state = initWorld(resolveConfig({ seed: 1, agentCount: 4 })).state;
  state.agents[A]!.location = 'commons';
  state.agents[A]!.needs = { satiety: 50, energy: 50 };
  state.agents[A]!.resources = { food: 0, coins: 0, materials: 0 };
  state.locations['commons']!.stock = { food: 10, coins: 0, materials: 4 };
  ctx = makeCtx(state);
});

const action = (type: AgentAction['type'], params: AgentAction['params'] = {}): AgentAction => ({
  actorId: A,
  type,
  params,
  source: 'scripted',
});

describe('registry', () => {
  it('kennt genau die implementierten Aktionen', () => {
    expect(IMPLEMENTED_ACTIONS.map((d) => d.type).sort()).toEqual([
      'consume',
      'gather_resource',
      'move',
      'rest',
    ]);
  });

  it('meldet nicht implementierte Aktionen als solche', () => {
    expect(findAction('trade')).toBeUndefined();
    expect(() => requireAction('trade')).toThrow(/nicht implementiert/);
  });
});

describe('rest', () => {
  it('ist immer legal — auch ohne Energie und ohne Vorrat', () => {
    state.agents[A]!.needs = { satiety: 0, energy: 0 };
    expect(restAction.precondition(action('rest'), ctx).ok).toBe(true);
    expect(restAction.generate(state.agents[A]!, ctx)).toHaveLength(1);
  });

  it('gibt Energie und kostet ein wenig Saettigung', () => {
    const { effects } = restAction.resolve(action('rest'), ctx);
    expect(effects).toEqual([
      { t: 'need', agentId: A, delta: { energy: 18, satiety: -1 } },
    ]);
  });

  it('meldet nur den tatsaechlichen Gewinn, wenn die Obergrenze im Weg ist', () => {
    state.agents[A]!.needs = { satiety: 0, energy: 95 };
    const { effects, events } = restAction.resolve(action('rest'), ctx);
    expect(effects[0]).toMatchObject({ delta: { energy: 5, satiety: -0 } });
    expect(events[0]?.payload).toEqual({ energyGain: 5, satietyCost: 0 });
  });
});

describe('gather_resource', () => {
  it('bietet nur Ressourcen an, die am Ort vorhanden sind', () => {
    const labels = gatherResourceAction.generate(state.agents[A]!, ctx).map((c) => c.label);
    expect(labels).toEqual(['gather_resource:food', 'gather_resource:materials']);
  });

  it('bietet nichts an, wenn die Energie nicht reicht', () => {
    state.agents[A]!.needs.energy = 9;
    expect(gatherResourceAction.generate(state.agents[A]!, ctx)).toEqual([]);
  });

  it('lehnt bei zu wenig Energie ab', () => {
    state.agents[A]!.needs.energy = 9;
    const verdict = gatherResourceAction.precondition(action('gather_resource', { resource: 'food' }), ctx);
    expect(verdict).toMatchObject({ ok: false, reason: 'precondition_failed' });
  });

  it('lehnt bei leerem Bestand ab', () => {
    state.locations['commons']!.stock.food = 0;
    const verdict = gatherResourceAction.precondition(action('gather_resource', { resource: 'food' }), ctx);
    expect(verdict).toMatchObject({ ok: false, reason: 'precondition_failed' });
  });

  it('lehnt einen unbekannten Ressourcenparameter ab', () => {
    const verdict = gatherResourceAction.precondition(action('gather_resource', { resource: 'gold' }), ctx);
    expect(verdict).toMatchObject({ ok: false, reason: 'schema_invalid' });
  });

  it('verschiebt Bestand statt ihn zu erzeugen', () => {
    const { effects } = gatherResourceAction.resolve(action('gather_resource', { resource: 'food' }), ctx);
    const fromLocation = effects.find((e) => e.t === 'location_stock');
    const toAgent = effects.find((e) => e.t === 'resource');

    expect(fromLocation).toBeDefined();
    expect(toAgent).toBeDefined();
    if (fromLocation?.t !== 'location_stock' || toAgent?.t !== 'resource') throw new Error('unerwartet');
    expect(fromLocation.delta.food).toBe(-(toAgent.delta.food ?? 0));
    expect(fromLocation.reason).toBe('transfer');
  });

  it('kostet Energie', () => {
    const { effects } = gatherResourceAction.resolve(action('gather_resource', { resource: 'food' }), ctx);
    expect(effects.find((e) => e.t === 'need')).toMatchObject({ delta: { energy: -10 } });
  });

  it('respektiert die Reservierungen frueherer Agenten (first-come-first-served)', () => {
    ctx.ledger.reserve('commons', 'food', 10);
    const { effects, events } = gatherResourceAction.resolve(
      action('gather_resource', { resource: 'food' }),
      ctx,
    );

    expect(events[0]?.type).toBe('gather_failed');
    expect(events[0]?.payload).toMatchObject({ reason: 'stock_depleted' });
    // Der Versuch kostet trotzdem Energie — sonst waere er gratis wiederholbar.
    expect(effects).toEqual([{ t: 'need', agentId: A, delta: { energy: -10 } }]);
  });

  it('erntet nie mehr, als noch da ist', () => {
    state.locations['commons']!.stock.food = 1;
    const { effects } = gatherResourceAction.resolve(action('gather_resource', { resource: 'food' }), ctx);
    expect(effects.find((e) => e.t === 'resource')).toMatchObject({ delta: { food: 1 } });
  });

  it('liefert bei gleichem Seed, Runde und Agent denselben Ertrag', () => {
    const first = gatherResourceAction.resolve(action('gather_resource', { resource: 'food' }), makeCtx(state));
    const second = gatherResourceAction.resolve(action('gather_resource', { resource: 'food' }), makeCtx(state));
    expect(first.effects).toEqual(second.effects);
  });
});

describe('move', () => {
  it('bietet genau die Nachbarorte an', () => {
    const labels = moveAction.generate(state.agents[A]!, ctx).map((c) => c.label);
    expect(labels).toEqual(['move:fields', 'move:warehouse', 'move:well']);
  });

  it('bietet nichts an, wenn die Energie nicht reicht', () => {
    state.agents[A]!.needs.energy = 4;
    expect(moveAction.generate(state.agents[A]!, ctx)).toEqual([]);
  });

  it('lehnt einen Ort ab, der kein Nachbar ist', () => {
    const verdict = moveAction.precondition(action('move', { to: 'outskirts' }), ctx);
    expect(verdict).toMatchObject({ ok: false, reason: 'precondition_failed' });
  });

  it('lehnt einen unbekannten Ort ab', () => {
    const verdict = moveAction.precondition(action('move', { to: 'atlantis' }), ctx);
    expect(verdict).toMatchObject({ ok: false, reason: 'schema_invalid' });
  });

  it('wechselt den Ort und kostet Energie', () => {
    const { effects, events } = moveAction.resolve(action('move', { to: 'fields' }), ctx);
    expect(effects).toEqual([
      { t: 'move', agentId: A, to: 'fields' },
      { t: 'need', agentId: A, delta: { energy: -5 } },
    ]);
    expect(events[0]?.payload).toMatchObject({ from: 'commons', to: 'fields' });
  });

  it('ist am Zielort sichtbar', () => {
    const { events } = moveAction.resolve(action('move', { to: 'fields' }), ctx);
    expect(events[0]?.visibility).toEqual({ scope: 'location', locationId: 'fields' });
  });
});

describe('consume', () => {
  it('bietet Essen an, wenn Vorrat da und der Magen nicht voll ist', () => {
    state.agents[A]!.resources.food = 2;
    state.agents[A]!.needs.satiety = 40;
    expect(consumeAction.generate(state.agents[A]!, ctx)).toHaveLength(1);
  });

  it('bietet nichts an ohne Vorrat', () => {
    state.agents[A]!.resources.food = 0;
    expect(consumeAction.generate(state.agents[A]!, ctx)).toEqual([]);
  });

  it('bietet nichts an bei voller Saettigung', () => {
    state.agents[A]!.resources.food = 5;
    state.agents[A]!.needs.satiety = 100;
    expect(consumeAction.generate(state.agents[A]!, ctx)).toEqual([]);
  });

  it('lehnt ohne Vorrat ab', () => {
    state.agents[A]!.resources.food = 0;
    expect(consumeAction.precondition(action('consume'), ctx)).toMatchObject({
      ok: false,
      reason: 'insufficient_resources',
    });
  });

  it('tauscht Nahrung gegen Saettigung', () => {
    state.agents[A]!.resources.food = 3;
    state.agents[A]!.needs.satiety = 40;
    const { effects } = consumeAction.resolve(action('consume'), ctx);
    expect(effects).toEqual([
      { t: 'resource', agentId: A, delta: { food: -1 } },
      { t: 'need', agentId: A, delta: { satiety: 25 } },
    ]);
  });

  it('meldet nur den tatsaechlichen Gewinn nahe der Obergrenze', () => {
    state.agents[A]!.resources.food = 3;
    state.agents[A]!.needs.satiety = 90;
    const { effects, events } = consumeAction.resolve(action('consume'), ctx);
    expect(effects[1]).toMatchObject({ delta: { satiety: 10 } });
    expect(events[0]?.payload).toEqual({ food: 1, satietyGain: 10 });
  });
});

describe('Aktionen sind rein', () => {
  it('veraendert den State weder in generate noch in precondition noch in resolve', () => {
    const before = canonicalJson(state);

    for (const def of IMPLEMENTED_ACTIONS) {
      const candidates = def.generate(state.agents[A]!, ctx);
      for (const candidate of candidates) {
        const request = action(candidate.type, candidate.params);
        def.precondition(request, ctx);
        def.resolve(request, ctx);
      }
    }

    expect(canonicalJson(state)).toBe(before);
  });
});
