import { beforeEach, describe, expect, it } from 'vitest';

import { requestInformationAction } from '@/engine/actions/defs/requestInformation.js';
import type { ActionContext } from '@/engine/actions/types.js';
import { resolveConfig } from '@/engine/core/config.js';
import { createEventLog } from '@/engine/core/eventLog.js';
import { createRngBundle } from '@/engine/core/rng.js';
import type { AgentAction, AgentId, WorldState } from '@/engine/core/types.js';
import { stockInfoId } from '@/engine/information/infoRegistry.js';
import { observedEntry } from '@/engine/information/knowledge.js';
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

function makeCtx(current: WorldState, round = current.round): ActionContext {
  return {
    state: current,
    round,
    rng: createRngBundle(11),
    projection: new EffectProjection(current),
    log: createEventLog(current.matchId),
  };
}

beforeEach(() => {
  state = initWorld(resolveConfig({ seed: 11, agentCount: 4 })).state;
  for (const id of [A, B]) state.agents[id]!.location = 'commons';
  state.agents[FAR]!.location = 'outskirts';
  ctx = makeCtx(state);
});

function teach(agentId: AgentId, believedValue: number): void {
  applyEffects(state, [
    effect.knowledge(
      agentId,
      observedEntry({ infoId, believedValue, round: state.round, source: 'observed', sourceEventId: 'event_0001_00000' }),
    ),
  ]);
}

const action = (patch: Partial<AgentAction> = {}): AgentAction => ({
  actorId: A,
  type: 'request_information',
  params: { target: B, infoId },
  source: 'scripted',
  ...patch,
});

describe('generate', () => {
  it('fragt nichts, ohne dass jemand anwesend ist', () => {
    state.agents[B]!.location = 'outskirts';
    expect(requestInformationAction.generate(state.agents[A]!, ctx)).toEqual([]);
  });

  it('fragt nach dem Ort, ueber den am wenigsten bekannt ist', () => {
    const candidates = requestInformationAction.generate(state.agents[A]!, ctx);
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(candidate.params['target']).toBe(B);
      expect(typeof candidate.params['infoId']).toBe('string');
    }
  });

  it('fragt nicht mehr, sobald die Sicherheit ueber allen anderen Orten die Schwelle haelt', () => {
    // Alle food-Infos der jeweils anderen Orte kuenstlich auf volle Sicherheit setzen.
    for (const locationId of ['fields', 'warehouse', 'well', 'workshop', 'outskirts'] as const) {
      applyEffects(state, [
        effect.knowledge(
          A,
          observedEntry({
            infoId: stockInfoId(locationId, 'food'),
            believedValue: 5,
            round: state.round,
            source: 'observed',
            sourceEventId: 'event_0001_00000',
          }),
        ),
      ]);
    }
    expect(requestInformationAction.generate(state.agents[A]!, ctx)).toEqual([]);
  });
});

describe('precondition', () => {
  it('lehnt fehlende Parameter ab', () => {
    expect(requestInformationAction.precondition(action({ params: {} }), ctx)).toMatchObject({
      ok: false,
      reason: 'schema_invalid',
    });
  });

  it('lehnt Selbstbefragung ab', () => {
    expect(requestInformationAction.precondition(action({ params: { target: A, infoId } }), ctx)).toMatchObject({
      ok: false,
      reason: 'target_invalid',
    });
  });

  it('lehnt ein Ziel an einem anderen Ort ab', () => {
    expect(
      requestInformationAction.precondition(action({ params: { target: FAR, infoId } }), ctx),
    ).toMatchObject({ ok: false, reason: 'target_invalid' });
  });

  it('lehnt eine nicht registrierte Info ab', () => {
    expect(
      requestInformationAction.precondition(action({ params: { target: B, infoId: 'info_nichts' } }), ctx),
    ).toMatchObject({ ok: false, reason: 'unknown_reference' });
  });

  it('akzeptiert eine gueltige Anfrage', () => {
    expect(requestInformationAction.precondition(action(), ctx)).toEqual({ ok: true });
  });
});

describe('resolve — das Ziel weiss nichts', () => {
  it('antwortet mit express_uncertainty und ueberliefert nichts', () => {
    const { effects, events } = requestInformationAction.resolve(action(), ctx);
    expect(effects).toEqual([]);
    expect(events[0]).toMatchObject({
      type: 'information_refused',
      actorId: B,
      targetId: A,
      payload: { kind: 'express_uncertainty' },
    });
  });
});

describe('resolve — das Ziel weiss etwas und ist ehrlich', () => {
  beforeEach(() => {
    teach(B, 20);
    state.agents[B]!.personality.honesty = 100;
  });

  it('antwortet immer informativ — refusalChance ist bei honesty 100 null', () => {
    for (let round = 1; round <= 20; round += 1) {
      const local = makeCtx(state, round);
      const { events } = requestInformationAction.resolve(action(), local);
      expect(events[0]!.type).toBe('information_shared');
    }
  });

  it('gibt dem Fragenden einen told_by-Eintrag mit reduzierter Sicherheit', () => {
    const { effects } = requestInformationAction.resolve(action(), ctx);
    applyEffects(state, effects);
    const entry = state.agents[A]!.knowledge[infoId];
    expect(entry).toBeDefined();
    expect(entry!.source).toBe('told_by');
    expect(entry!.sourceAgent).toBe(B);
    expect(entry!.certainty).toBeCloseTo(state.config.info.hearsayRetention);
  });

  it('haelt die Antwort im eigenen R7-Gedaechtnis fest, nicht im Namen des Fragenden', () => {
    const { effects } = requestInformationAction.resolve(action(), ctx);
    const statementEffect = effects.find((e) => e.t === 'statement');
    expect(statementEffect).toMatchObject({ t: 'statement', agentId: B });
  });

  it('setzt einen aufloesbaren sourceEventId', () => {
    const { effects, events } = requestInformationAction.resolve(action(), ctx);
    applyEffects(state, effects);
    const event = ctx.log.append(events[0]!);
    expect(state.agents[A]!.knowledge[infoId]!.sourceEventId).toBe(event.id);
  });

  it('das Event traegt keine infoRefs', () => {
    const { events } = requestInformationAction.resolve(action(), ctx);
    expect(events[0]!.infoRefs).toEqual([]);
  });
});

describe('resolve — das Ziel weiss etwas, ist aber verschlossen', () => {
  beforeEach(() => {
    teach(B, 20);
    state.agents[B]!.personality.honesty = 0;
  });

  it('verweigert manchmal, aber nicht immer — beides muss vorkommen', () => {
    let refused = 0;
    let informed = 0;
    for (let round = 1; round <= 40; round += 1) {
      const local = makeCtx(state, round);
      const { events } = requestInformationAction.resolve(action(), local);
      if (events[0]!.type === 'information_refused') refused += 1;
      else informed += 1;
    }
    expect(refused).toBeGreaterThan(0);
    expect(informed).toBeGreaterThan(0);
  });

  it('verweigert mit withhold, nicht mit refuse_to_answer — Doc 03 §3.2.1', () => {
    let sawWithhold = false;
    for (let round = 1; round <= 40; round += 1) {
      const local = makeCtx(state, round);
      const { events } = requestInformationAction.resolve(action(), local);
      if (events[0]!.payload['kind'] === 'withhold') sawWithhold = true;
    }
    expect(sawWithhold).toBe(true);
  });
});

describe('resolve — zweite Verteidigungslinie', () => {
  it('faellt auf express_uncertainty zurueck, wenn die konstruierte Aussage sich selbst widerspraeche', () => {
    teach(B, 20);
    state.agents[B]!.personality.honesty = 100;

    // B hat gestern (mit unveraendertem Wissen) das Gegenteil von dem
    // behauptet, was `statementFor` jetzt konstruieren wuerde — R7 wuerde die
    // konstruierte Aussage ablehnen, waere da keine zweite Pruefung.
    state.statementLog[B] = {
      [infoId]: {
        infoId,
        kind: 'assert_fact',
        disclosure: { mode: 'qualitative', bucket: 'none' },
        believedValueAtTime: 20,
        round: state.round,
      },
    };

    const { events } = requestInformationAction.resolve(action(), ctx);
    expect(events[0]!.type).toBe('information_refused');
    expect(events[0]!.payload['kind']).toBe('express_uncertainty');
  });
});
