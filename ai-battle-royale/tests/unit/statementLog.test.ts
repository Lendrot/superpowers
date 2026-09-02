/**
 * Das Gedaechtnis hinter R7: was ein Agent gesagt hat, und was davon bindet.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { resolveConfig } from '@/engine/core/config.js';
import type { AgentId, KnowledgeEntry, WorldState } from '@/engine/core/types.js';
import { stockInfoId } from '@/engine/information/infoRegistry.js';
import { lastStatement, statementRecordFor } from '@/engine/information/statementLog.js';
import { effect } from '@/engine/mutation/effects.js';
import { applyEffects } from '@/engine/mutation/stateMutator.js';
import { initWorld } from '@/engine/world/initWorld.js';

const A: AgentId = 'agent_000';
const infoId = stockInfoId('commons', 'food');

let state: WorldState;

beforeEach(() => {
  state = initWorld(resolveConfig({ seed: 7, agentCount: 3 })).state;
});

const entry = (believedValue: number): KnowledgeEntry => ({
  infoId,
  believedValue,
  certainty: 1,
  source: 'observed',
  acquiredRound: 1,
  lastConfirmedRound: 1,
  sharedWith: [],
  isSecret: false,
});

describe('statementRecordFor', () => {
  it('haelt den geglaubten Wert zum Zeitpunkt der Aussage fest', () => {
    const record = statementRecordFor(
      { kind: 'assert_fact', infoId, disclosure: { mode: 'qualitative', bucket: 'much' } },
      entry(40),
      12,
    );
    expect(record).toEqual({
      infoId,
      kind: 'assert_fact',
      disclosure: { mode: 'qualitative', bucket: 'much' },
      believedValueAtTime: 40,
      round: 12,
    });
  });

  it('bindet niemanden, wo nichts behauptet wurde', () => {
    expect(statementRecordFor({ kind: 'refuse_to_answer', topic: 'stock_at_location' }, entry(40), 12))
      .toBeNull();
    expect(statementRecordFor({ kind: 'declare_intent', intent: 'ich helfe' }, entry(40), 12)).toBeNull();
  });

  it('ohne Wissen gibt es nichts festzuhalten', () => {
    expect(statementRecordFor({ kind: 'assert_absence', infoId }, undefined, 12)).toBeNull();
  });
});

describe('statement-Effekt im StateMutator', () => {
  it('schreibt genau einen Eintrag je Agent und Info und ueberschreibt ihn', () => {
    const first = statementRecordFor(
      { kind: 'assert_fact', infoId, disclosure: { mode: 'qualitative', bucket: 'much' } },
      entry(40),
      1,
    )!;
    applyEffects(state, [effect.statement(A, first)]);
    expect(lastStatement(state.statementLog, A, infoId)).toEqual(first);

    const second = statementRecordFor(
      { kind: 'assert_fact', infoId, disclosure: { mode: 'qualitative', bucket: 'none' } },
      entry(0),
      5,
    )!;
    applyEffects(state, [effect.statement(A, second)]);
    // Geprueft wird gegen das zuletzt gezeichnete Bild, nicht gegen alles je
    // Gesagte — deshalb ersetzt der neue Eintrag den alten.
    expect(lastStatement(state.statementLog, A, infoId)).toEqual(second);
    expect(Object.keys(state.statementLog[A] ?? {})).toEqual([infoId]);
  });

  it('kennt keine Aussage eines Agenten, der nie gesprochen hat', () => {
    expect(lastStatement(state.statementLog, A, infoId)).toBeUndefined();
    expect(lastStatement({}, A, infoId)).toBeUndefined();
  });

  it('wirft fuer einen Agenten, den es nicht gibt', () => {
    const record = statementRecordFor({ kind: 'assert_absence', infoId }, entry(0), 1)!;
    expect(() => applyEffects(state, [effect.statement('agent_999', record)])).toThrow();
  });
});
