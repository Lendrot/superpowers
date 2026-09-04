import { beforeEach, describe, expect, it } from 'vitest';

import { shareInformationAction } from '@/engine/actions/defs/shareInformation.js';
import type { ActionContext } from '@/engine/actions/types.js';
import { resolveConfig } from '@/engine/core/config.js';
import { createEventLog } from '@/engine/core/eventLog.js';
import { createRngBundle } from '@/engine/core/rng.js';
import type { AgentAction, AgentId, Statement, WorldState } from '@/engine/core/types.js';
import { stockInfoId } from '@/engine/information/infoRegistry.js';
import { observedEntry } from '@/engine/information/knowledge.js';
import { effect } from '@/engine/mutation/effects.js';
import { applyEffects } from '@/engine/mutation/stateMutator.js';
import { EffectProjection } from '@/engine/validation/validateAction.js';
import { initWorld } from '@/engine/world/initWorld.js';

/**
 * Fix 3 (Opus-Review, Punkt 3): `share_information`/`request_information`
 * lasen `existing`/den eigenen Eintrag frueher direkt aus `ctx.state` —
 * dem Stand vom Rundenbeginn. Innerhalb einer Runde loesen aber mehrere
 * Aktionen derselben Klasse (5) nacheinander gegen DIESELBE `EffectProjection`
 * auf (`runner/runRound.ts`), genau wie hier simuliert: zwei
 * `share_information`-Aufloesungen teilen sich einen `ctx`.
 */

const A: AgentId = 'agent_000'; // Erzaehlt zuerst, hohe Sicherheit
const P: AgentId = 'agent_001'; // Erzaehlt danach, niedrige Sicherheit
const T: AgentId = 'agent_002'; // Empfaengt beides
const M: AgentId = 'agent_003'; // Fuer den zweiten Testfall: Sender mit veraltetem eigenem Stand

const infoId = stockInfoId('warehouse', 'food');

let state: WorldState;

function makeCtx(current: WorldState): ActionContext {
  return {
    state: current,
    round: current.round,
    rng: createRngBundle(17),
    projection: new EffectProjection(current),
    log: createEventLog(current.matchId),
  };
}

const shareAction = (from: AgentId, to: AgentId, statement: Statement): AgentAction => ({
  actorId: from,
  type: 'share_information',
  params: { target: to },
  statement,
  source: 'scripted',
});

beforeEach(() => {
  state = initWorld(resolveConfig({ seed: 17, agentCount: 5 })).state;
  for (const id of [A, P, T, M]) state.agents[id]!.location = 'commons';
});

describe('deriveToldEntry vergleicht gegen den Rundenstand, nicht gegen den Rundenanfang', () => {
  it('eine zweite, schwaechere Mitteilung derselben Runde ueberschreibt die erste nicht', () => {
    applyEffects(state, [
      effect.knowledge(
        A,
        observedEntry({ infoId, believedValue: 20, round: state.round, source: 'observed', sourceEventId: 'event_0001_00000' }),
      ),
      effect.knowledge(P, {
        infoId,
        believedValue: 20,
        certainty: 0.4,
        source: 'told_by',
        sourceAgent: 'agent_999' as AgentId,
        acquiredRound: state.round,
        lastConfirmedRound: state.round,
        sharedWith: [],
        isSecret: false,
      }),
    ]);

    // Beide Aktionen loesen in DERSELBEN Runde gegen DIESELBE Projektion auf —
    // A zuerst (hoehere Sicherheit), P danach (niedrigere). Genau die
    // Reihenfolge, in der `runRound.ts` eine Klasse abarbeitet. Entscheidend
    // fuer den Test: `state` selbst bleibt bis zum Schluss unveraendert — nur
    // die PROJEKTION erfaehrt zwischendurch von As Mitteilung, exakt wie in
    // Phase 6, wo der `batch` erst in Phase 7 auf einmal angewendet wird.
    const ctx = makeCtx(state);

    const stmtA: Statement = { kind: 'assert_fact', infoId, disclosure: { mode: 'exact', value: 20 } };
    const fromA = shareInformationAction.resolve(shareAction(A, T, stmtA), ctx);
    ctx.projection.commit(fromA.effects);
    for (const draft of fromA.events) ctx.log.append(draft);

    const stmtP: Statement = { kind: 'hearsay', infoId, sourceAgent: 'agent_999' as AgentId, disclosure: { mode: 'exact', value: 20 } };
    const fromP = shareInformationAction.resolve(shareAction(P, T, stmtP), ctx);
    ctx.projection.commit(fromP.effects);
    for (const draft of fromP.events) ctx.log.append(draft);

    // Erst jetzt, als EIN Batch — wie Phase 7.
    applyEffects(state, [...fromA.effects, ...fromP.effects]);

    // T behaelt die von A stammende, sicherere Version — P's schwaechere
    // Mitteilung darf sie nicht verdraengt haben.
    const tEntry = state.agents[T]!.knowledge[infoId]!;
    expect(tEntry.sourceAgent).toBe(A);
    expect(tEntry.certainty).toBeCloseTo(1 * state.config.info.hearsayRetention);
  });

  it('ohne Live-Vergleich wuerde die zweite (schwaechere) Mitteilung faelschlich gewinnen', () => {
    // Gegenprobe, so nah wie moeglich am tatsaechlichen Fehler vor Fix 3: in
    // Phase 6 mutiert NICHTS den `state` — `runRound.ts` sammelt alle Effekte
    // der Runde in einem `batch` und wendet ihn erst in Phase 7 auf einmal an
    // (siehe `applyEffects(state, batch)` dort). Vor Fix 3 las
    // `share_information` `target.knowledge[infoId]` direkt aus `ctx.state` —
    // und `ctx.state` haette zu BEIDEN Zeitpunkten "T weiss nichts" gezeigt,
    // egal in welcher Reihenfolge aufgeloest wurde. Beide Mitteilungen haetten
    // sich deshalb faelschlich fuer "die erste" gehalten, und im finalen Batch
    // gewinnt schlicht, wessen Effekt zuletzt steht — hier P, obwohl A sicherer war.
    applyEffects(state, [
      effect.knowledge(
        A,
        observedEntry({ infoId, believedValue: 20, round: state.round, source: 'observed', sourceEventId: 'event_0001_00000' }),
      ),
      effect.knowledge(P, {
        infoId,
        believedValue: 20,
        certainty: 0.4,
        source: 'told_by',
        sourceAgent: 'agent_999' as AgentId,
        acquiredRound: state.round,
        lastConfirmedRound: state.round,
        sharedWith: [],
        isSecret: false,
      }),
    ]);

    const stmtA: Statement = { kind: 'assert_fact', infoId, disclosure: { mode: 'exact', value: 20 } };
    const stmtP: Statement = { kind: 'hearsay', infoId, sourceAgent: 'agent_999' as AgentId, disclosure: { mode: 'exact', value: 20 } };

    // Zwei frische Projektionen — keine sieht die andere. Und `state` bleibt
    // bis zum Schluss unveraendert, wie in Phase 6.
    const fromA = shareInformationAction.resolve(shareAction(A, T, stmtA), makeCtx(state));
    const fromP = shareInformationAction.resolve(shareAction(P, T, stmtP), makeCtx(state));

    // Ein Batch, in Aufloesungsreihenfolge — genau wie Phase 7.
    applyEffects(state, [...fromA.effects, ...fromP.effects]);

    const tEntry = state.agents[T]!.knowledge[infoId]!;
    expect(tEntry.sourceAgent).toBe(P);
  });
});

describe('das eigene sharedWith-Update ueberschreibt keinen frischeren eigenen Eintrag', () => {
  it('haelt den in dieser Runde neu erhaltenen Eintrag, statt ihn beim Weitererzaehlen zu verlieren', () => {
    // M startet die Runde mit einem schwachen, veralteten Eintrag ...
    applyEffects(state, [
      effect.knowledge(M, {
        infoId,
        believedValue: 20,
        certainty: 0.3,
        source: 'told_by',
        sourceAgent: 'agent_998' as AgentId,
        acquiredRound: 1,
        lastConfirmedRound: 1,
        sharedWith: [],
        isSecret: false,
      }),
      effect.knowledge(
        A,
        observedEntry({ infoId, believedValue: 20, round: state.round, source: 'observed', sourceEventId: 'event_0001_00000' }),
      ),
    ]);

    // `state` bleibt bis zum Schluss unveraendert (wie Phase 6) — nur die
    // Projektion erfaehrt zwischendurch von der frischeren Version.
    const ctx = makeCtx(state);

    // ... bekommt DIESE Runde zuerst eine frische, sicherere Version von A ...
    const stmtA: Statement = { kind: 'assert_fact', infoId, disclosure: { mode: 'exact', value: 20 } };
    const fromA = shareInformationAction.resolve(shareAction(A, M, stmtA), ctx);
    ctx.projection.commit(fromA.effects);
    for (const draft of fromA.events) ctx.log.append(draft);
    const freshEntry = fromA.effects.find(
      (e): e is Extract<typeof e, { t: 'knowledge' }> => e.t === 'knowledge' && e.agentId === M,
    )!.entry;
    expect(freshEntry.certainty).toBeCloseTo(1 * state.config.info.hearsayRetention);
    // Der State selbst weiss davon noch nichts — Ms Eintrag ist dort weiterhin
    // die schwache 0.3-Version vom Rundenbeginn.
    expect(state.agents[M]!.knowledge[infoId]!.certainty).toBe(0.3);

    // ... und erzaehlt es DANACH, in derselben Runde, an T weiter.
    const stmtM: Statement = { kind: 'hearsay', infoId, sourceAgent: A, disclosure: { mode: 'exact', value: 20 } };
    const fromM = shareInformationAction.resolve(shareAction(M, T, stmtM), ctx);

    // Erst jetzt, als EIN Batch — wie Phase 7.
    applyEffects(state, [...fromA.effects, ...fromM.effects]);

    // Ms eigener Eintrag muss die frische Version bleiben (samt neuem
    // sharedWith-Eintrag fuer T) — nicht auf die veraltete 0.3-Version
    // vom Rundenbeginn zurueckfallen.
    const mEntry = state.agents[M]!.knowledge[infoId]!;
    expect(mEntry.certainty).toBeCloseTo(freshEntry.certainty);
    expect(mEntry.sourceAgent).toBe(A);
    expect(mEntry.sharedWith).toContain(T);
  });
});
