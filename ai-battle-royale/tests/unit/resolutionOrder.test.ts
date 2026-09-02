import { describe, expect, it } from 'vitest';

import { actionClassOf, initiativeOf, orderActions } from '@/engine/actions/resolutionOrder.js';
import { resolveConfig } from '@/engine/core/config.js';
import { createRngBundle } from '@/engine/core/rng.js';
import type { RngBundle } from '@/engine/core/rng.js';
import type { AgentAction, AgentId } from '@/engine/core/types.js';
import { initWorld } from '@/engine/world/initWorld.js';

function setup() {
  const state = initWorld(resolveConfig({ seed: 4, agentCount: 6 })).state;
  return { state, rng: createRngBundle(4) };
}

const act = (actorId: AgentId, type: AgentAction['type']): AgentAction => ({
  actorId,
  type,
  params: type === 'gather_resource' ? { resource: 'food' } : {},
  source: 'scripted',
});

describe('Auflösungsreihenfolge', () => {
  it('haelt die Klassenreihenfolge aus Doc 04 §4.3 ein', () => {
    expect(actionClassOf('move')).toBeLessThan(actionClassOf('rest'));
    expect(actionClassOf('rest')).toBe(actionClassOf('consume'));
    expect(actionClassOf('rest')).toBeLessThan(actionClassOf('gather_resource'));
    expect(actionClassOf('gather_resource')).toBeLessThan(actionClassOf('trade'));
    expect(actionClassOf('confront')).toBeGreaterThan(actionClassOf('offer_alliance'));
  });

  it('loest Klassen vor Initiative auf', () => {
    const { state, rng } = setup();
    const ordered = orderActions(
      [act('agent_000', 'gather_resource'), act('agent_001', 'rest')],
      state,
      1,
      rng,
    );
    expect(ordered.map((o) => o.action.type)).toEqual(['rest', 'gather_resource']);
  });

  it('sortiert innerhalb einer Klasse nach Initiative absteigend', () => {
    const { state, rng } = setup();
    const ordered = orderActions(
      ['agent_000', 'agent_001', 'agent_002', 'agent_003'].map((id) => act(id as AgentId, 'rest')),
      state,
      1,
      rng,
    );
    const values = ordered.map((o) => o.initiative);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });

  it('ist reproduzierbar', () => {
    const a = setup();
    const b = setup();
    const actions = ['agent_000', 'agent_001', 'agent_002'].map((id) => act(id as AgentId, 'rest'));

    expect(orderActions(actions, a.state, 7, a.rng).map((o) => o.action.actorId)).toEqual(
      orderActions(actions, b.state, 7, b.rng).map((o) => o.action.actorId),
    );
  });

  it('bricht Gleichstand nach AgentId', () => {
    const { state } = setup();
    // Gleiche Dominanz und Energie: dann entscheidet nur noch der Wurf, und bei
    // exakt gleichem Wurf die ID. Der Fall ist konstruiert, aber der Vertrag
    // muss ihn abdecken.
    for (const agent of Object.values(state.agents)) {
      if (!agent) continue;
      agent.personality.dominance = 50;
      agent.needs.energy = 50;
    }
    const stubRng = { derive: () => ({ float: () => 0.5 }) } as unknown as RngBundle;
    const ordered = orderActions(
      [act('agent_002', 'rest'), act('agent_000', 'rest'), act('agent_001', 'rest')],
      state,
      1,
      stubRng,
    );
    expect(ordered.map((o) => o.action.actorId)).toEqual(['agent_000', 'agent_001', 'agent_002']);
  });

  it('initiative haengt an Dominanz, Energie und Wurf', () => {
    const { state, rng } = setup();
    state.agents['agent_000']!.personality.dominance = 100;
    state.agents['agent_000']!.needs.energy = 100;
    state.agents['agent_001']!.personality.dominance = 0;
    state.agents['agent_001']!.needs.energy = 0;

    expect(initiativeOf(state, 'agent_000', 1, rng)).toBeGreaterThan(
      initiativeOf(state, 'agent_001', 1, rng),
    );
  });
});
