import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveConfig } from '@/engine/core/config.js';
import { createRngBundle } from '@/engine/core/rng.js';
import type { AgentId, Lesson, WorldState } from '@/engine/core/types.js';
import { buildAgentView } from '@/engine/agents/agentView.js';
import { policyProvider } from '@/engine/decision/policyProvider.js';
import { UTILITY_WEIGHTS, scoreOf, weightFor } from '@/engine/decision/utility.js';
import { initWorld } from '@/engine/world/initWorld.js';

const A: AgentId = 'agent_000';
const B: AgentId = 'agent_001';
const C: AgentId = 'agent_002';

let state: WorldState;

beforeEach(() => {
  state = initWorld(resolveConfig({ seed: 3, agentCount: 4 })).state;
});

function lesson(key: string, subjectRef: AgentId, confidence: number): Lesson {
  return {
    key,
    scope: 'about_agent',
    subjectRef,
    statement: 'Test.',
    confidence,
    evidenceCount: 5,
    contradictoryEvidence: 0,
    supportingEpisodeIds: ['event_0001_00000' as never],
    firstLearnedRound: 1,
    lastUpdated: 1,
    persistAcrossMatches: false,
  };
}

describe('weightFor', () => {
  it('ordnet bekannte Breakdown-Schluessel ihrer Doc-05-Kategorie zu', () => {
    expect(weightFor('survival')).toBe(UTILITY_WEIGHTS.survival);
    expect(weightFor('yield')).toBe(UTILITY_WEIGHTS.wealth);
    expect(weightFor('rapport')).toBe(UTILITY_WEIGHTS.social);
    expect(weightFor('allianceDrive')).toBe(UTILITY_WEIGHTS.alliance);
    expect(weightFor('exploration')).toBe(UTILITY_WEIGHTS.information);
    expect(weightFor('risk')).toBe(UTILITY_WEIGHTS.caution);
  });

  it('faellt fuer unbekannte Schluessel auf 1 zurueck', () => {
    expect(weightFor('unknown')).toBe(1);
    expect(weightFor('irgendwas_neues')).toBe(1);
  });
});

describe('UTILITY_WEIGHTS ist echt verdrahtet, nicht nur dekorativ', () => {
  const original = { ...UTILITY_WEIGHTS };
  afterEach(() => {
    Object.assign(UTILITY_WEIGHTS, original);
  });

  it('eine Gewichtsaenderung veraendert den tatsaechlichen Score einer Entscheidung', () => {
    state.agents[A]!.needs = { satiety: 100, energy: 5 };
    const view = buildAgentView(state, A);
    const rng = createRngBundle(3);

    const before = policyProvider.decide(view, [
      { type: 'rest', params: {}, label: 'rest' },
      { type: 'consume', params: {}, label: 'consume' },
    ], { round: 1, rng });
    const restBefore = before.scored.find((s) => s.candidate.type === 'rest')!.score;

    UTILITY_WEIGHTS.survival = 0;
    const after = policyProvider.decide(view, [
      { type: 'rest', params: {}, label: 'rest' },
      { type: 'consume', params: {}, label: 'consume' },
    ], { round: 1, rng: createRngBundle(3) });
    const restAfter = after.scored.find((s) => s.candidate.type === 'rest')!.score;

    expect(restAfter).toBeLessThan(restBefore);
  });
});

describe('lessonBias (T24)', () => {
  beforeEach(() => {
    for (const id of [A, B, C]) state.agents[id]!.location = 'commons';
  });

  it('senkt request_information gegen ein Ziel mit withholds_from_me', () => {
    state.agents[A]!.lessons = { [`withholds_from_me(${B})`]: lesson(`withholds_from_me(${B})`, B, 0.8) };
    const view = buildAgentView(state, A);
    const breakdown = scoreOf(view, { type: 'request_information', params: { target: B }, label: 'x' });
    expect(breakdown['lessonBias']).toBeCloseTo(-0.3 * 0.8);
  });

  it('hebt trade gegen ein Ziel mit trades_fairly an', () => {
    state.agents[A]!.lessons = { [`trades_fairly(${B})`]: lesson(`trades_fairly(${B})`, B, 0.9) };
    const view = buildAgentView(state, A);
    const breakdown = scoreOf(view, {
      type: 'trade',
      params: { target: B, give: { food: 1 }, want: { coins: 1 } },
      label: 'x',
    });
    expect(breakdown['lessonBias']).toBeCloseTo(0.3 * 0.9);
  });

  it('wirkt nicht auf ein anderes Ziel als subjectRef', () => {
    state.agents[A]!.lessons = { [`withholds_from_me(${B})`]: lesson(`withholds_from_me(${B})`, B, 0.8) };
    const view = buildAgentView(state, A);
    const breakdown = scoreOf(view, { type: 'request_information', params: { target: C }, label: 'x' });
    expect(breakdown['lessonBias']).toBeUndefined();
  });

  it('wirkt nicht auf einen Aktionstyp, den der Detektor nicht abdeckt', () => {
    state.agents[A]!.lessons = { [`trades_fairly(${B})`]: lesson(`trades_fairly(${B})`, B, 0.9) };
    const view = buildAgentView(state, A);
    const breakdown = scoreOf(view, { type: 'request_information', params: { target: B }, label: 'x' });
    expect(breakdown['lessonBias']).toBeUndefined();
  });

  it('summiert mehrere zutreffende Lessons fuer denselben Kandidaten', () => {
    state.agents[A]!.lessons = {
      [`attacked_me(${B})`]: lesson(`attacked_me(${B})`, B, 0.5),
      [`left_alliance(${B})`]: lesson(`left_alliance(${B})`, B, 0.5),
    };
    const view = buildAgentView(state, A);
    const breakdown = scoreOf(view, { type: 'offer_alliance', params: { target: B }, label: 'x' });
    // attacked_me: -0.3*0.5, left_alliance: -0.25*0.5
    expect(breakdown['lessonBias']).toBeCloseTo(-0.3 * 0.5 + -0.25 * 0.5);
  });

  it('beeinflusst tatsaechlich, welche Aktion policyProvider waehlt', () => {
    state.agents[A]!.lessons = { [`reliable_ally(${B})`]: lesson(`reliable_ally(${B})`, B, 1) };
    const view = buildAgentView(state, A);
    const rng = createRngBundle(3);
    const candidate = { type: 'offer_alliance' as const, params: { target: B }, label: 'offer' };

    const withBias = policyProvider.decide(view, [candidate], { round: 1, rng }).scored[0]!.score;

    state.agents[A]!.lessons = {};
    const viewWithout = buildAgentView(state, A);
    const withoutBias = policyProvider.decide(viewWithout, [candidate], { round: 1, rng: createRngBundle(3) }).scored[0]!
      .score;

    expect(withBias).toBeGreaterThan(withoutBias);
  });
});
