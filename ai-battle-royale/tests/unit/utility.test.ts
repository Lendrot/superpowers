import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveConfig } from '@/engine/core/config.js';
import { createRngBundle } from '@/engine/core/rng.js';
import type { AgentId, WorldState } from '@/engine/core/types.js';
import { buildAgentView } from '@/engine/agents/agentView.js';
import { policyProvider } from '@/engine/decision/policyProvider.js';
import { UTILITY_WEIGHTS, weightFor } from '@/engine/decision/utility.js';
import { initWorld } from '@/engine/world/initWorld.js';

const A: AgentId = 'agent_000';

let state: WorldState;

beforeEach(() => {
  state = initWorld(resolveConfig({ seed: 3, agentCount: 4 })).state;
});

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
