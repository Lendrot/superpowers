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

/**
 * Gate aus `12-build-order.md`, T18: "Hearsay-Kette A→B→C korrekt".
 *
 * A beobachtet selbst, erzaehlt B, B erzaehlt C weiter — ohne dass B oder C
 * je am Warehouse gestanden haetten. Jede Station muss:
 *  - die Quelle korrekt auf den unmittelbaren Erzaehler attribuieren (nicht
 *    auf A, sobald C von B hoert — Doc 03 §3.4.2 `sourceAgent` ist immer der
 *    letzte Sprecher in der Kette, keine transitive Zurechnung),
 *  - als `hearsay` sprechen, sobald die eigene Quelle selbst `told_by` ist
 *    (R2/R6 verbieten `assert_fact` fuer alles ausser `observed`/`participated`),
 *  - die Sicherheit mit jeder Station um `hearsayRetention` verlieren.
 */

const A: AgentId = 'agent_000';
const B: AgentId = 'agent_001';
const C: AgentId = 'agent_002';

const infoId = stockInfoId('warehouse', 'food');

let state: WorldState;

function ctxAt(round: number): ActionContext {
  return {
    state,
    round,
    rng: createRngBundle(5),
    projection: new EffectProjection(state),
    log: createEventLog(state.matchId),
  };
}

const shareAction = (from: AgentId, to: AgentId, statement: NonNullable<AgentAction['statement']>): AgentAction => ({
  actorId: from,
  type: 'share_information',
  params: { target: to },
  statement,
  source: 'scripted',
});

beforeEach(() => {
  state = initWorld(resolveConfig({ seed: 5, agentCount: 4 })).state;
  // A steht tatsaechlich am Warehouse; B und C nie — genau der Fall, den
  // `no-omniscience` fuer `told_by` gesondert zulaesst.
  state.agents[A]!.location = 'warehouse';
  state.agents[B]!.location = 'commons';
  state.agents[C]!.location = 'commons';

  applyEffects(state, [
    effect.knowledge(
      A,
      observedEntry({ infoId, believedValue: 20, round: 1, source: 'observed', sourceEventId: 'event_0001_00000' }),
    ),
  ]);
});

describe('Hoerensagen-Kette A → B → C', () => {
  it('A erzaehlt B: assert_fact, weil A selbst beobachtet hat', () => {
    const ctx = ctxAt(2);
    // B steht neben A? Nein — `shareInformationAction` prueft dieselbe
    // Ortsbindung wie jede andere Aktion. Fuer diesen Test wird direkt
    // `resolve` aufgerufen, wie es der Runner nach einer erfolgreichen
    // Validierung auch taete — die Ortsbindung selbst ist bereits durch
    // `shareInformation.test.ts` abgedeckt.
    state.agents[B]!.location = 'warehouse';

    const candidates = shareInformationAction.generate(state.agents[A]!, ctx);
    const statement = candidates.find((c) => c.params['target'] === B)!.statement!;
    expect(statement.kind).toBe('assert_fact');

    const { effects } = shareInformationAction.resolve(shareAction(A, B, statement), ctx);
    applyEffects(state, effects);

    const bEntry = state.agents[B]!.knowledge[infoId]!;
    expect(bEntry.source).toBe('told_by');
    expect(bEntry.sourceAgent).toBe(A);
    expect(bEntry.believedValue).toBe(20);
    // A beobachtete in Runde 1 mit voller Sicherheit; bis zum Erzaehlen in
    // Runde 2 ist bereits ein Tick Verfall vergangen (`stock_at_location` ist
    // 'fast') — das Erzaehlen selbst zieht danach `hearsayRetention` ab.
    const aCertaintyAtShareTime = effectiveCertainty(
      observedEntry({ infoId, believedValue: 20, round: 1, source: 'observed', sourceEventId: 'event_0001_00000' }),
      state.infoRegistry[infoId]!,
      2,
      state.config.info,
    );
    expect(bEntry.certainty).toBeCloseTo(aCertaintyAtShareTime * state.config.info.hearsayRetention);
  });

  it('B erzaehlt C weiter: hearsay, weil B selbst nur told_by hat — nicht assert_fact', () => {
    // B hat es von A (told_by), wie im vorigen Schritt.
    applyEffects(state, [
      effect.knowledge(B, {
        infoId,
        believedValue: 20,
        certainty: 0.7,
        source: 'told_by',
        sourceAgent: A,
        sourceEventId: 'event_0002_00001',
        acquiredRound: 2,
        lastConfirmedRound: 2,
        sharedWith: [],
        isSecret: false,
      }),
    ]);

    const ctx = ctxAt(3);
    const candidates = shareInformationAction.generate(state.agents[B]!, ctx);
    const statement = candidates.find((c) => c.params['target'] === C)!.statement!;

    // R2/R6: told_by kann nie assert_fact sein — nur hearsay (mit Quelle A)
    // oder belief. Da B eine Quelle nennen kann, muss es hearsay sein.
    expect(statement).toMatchObject({ kind: 'hearsay', infoId, sourceAgent: A });

    const { effects } = shareInformationAction.resolve(shareAction(B, C, statement), ctx);
    applyEffects(state, effects);

    const cEntry = state.agents[C]!.knowledge[infoId]!;
    // Attribution ist NICHT transitiv: C's Quelle ist B, der unmittelbare
    // Erzaehler — nicht A, die urspruengliche Beobachterin.
    expect(cEntry.source).toBe('told_by');
    expect(cEntry.sourceAgent).toBe(B);
    expect(cEntry.believedValue).toBe(20);
    // Zweite Station: nochmal hearsayRetention, diesmal auf Bs eigene
    // (bereits reduzierte UND zwischen Runde 2 und 3 weiter verfallene) Sicherheit.
    const bCertaintyAtShareTime = effectiveCertainty(
      state.agents[B]!.knowledge[infoId]!,
      state.infoRegistry[infoId]!,
      3,
      state.config.info,
    );
    expect(cEntry.certainty).toBeCloseTo(bCertaintyAtShareTime * state.config.info.hearsayRetention);
  });

  it('haelt die Sicherheit ueber die volle Kette nach — jede Station verliert etwas', () => {
    // Alle drei am selben Ort: nicht, weil es fuer die Kette noetig waere
    // (B und C waren nie am Warehouse, das ist ja der Punkt), sondern weil
    // `generate()` verlangt, dass Erzaehler und Ziel gerade nebeneinander
    // stehen — wo B und C sich treffen, ist fuer diesen Test gleichgueltig.
    state.agents[B]!.location = 'warehouse';
    state.agents[C]!.location = 'warehouse';
    const ctx2 = ctxAt(2);
    const stmtAB = shareInformationAction.generate(state.agents[A]!, ctx2).find((c) => c.params['target'] === B)!
      .statement!;
    applyEffects(state, shareInformationAction.resolve(shareAction(A, B, stmtAB), ctx2).effects);

    const ctx3 = ctxAt(3);
    const stmtBC = shareInformationAction.generate(state.agents[B]!, ctx3).find((c) => c.params['target'] === C)!
      .statement!;
    applyEffects(state, shareInformationAction.resolve(shareAction(B, C, stmtBC), ctx3).effects);

    const bEntryAfter = state.agents[B]!.knowledge[infoId]!;
    const certB = bEntryAfter.certainty;
    const certC = state.agents[C]!.knowledge[infoId]!.certainty;

    expect(certB).toBeLessThan(1);
    expect(certC).toBeLessThan(certB);

    const bCertaintyAtShareTime = effectiveCertainty(bEntryAfter, state.infoRegistry[infoId]!, 3, state.config.info);
    expect(certC).toBeCloseTo(bCertaintyAtShareTime * state.config.info.hearsayRetention);
  });
});
