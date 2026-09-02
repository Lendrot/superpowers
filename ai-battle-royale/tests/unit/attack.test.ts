import { beforeEach, describe, expect, it } from 'vitest';

import { attackAction } from '@/engine/actions/defs/attack.js';
import type { ActionContext } from '@/engine/actions/types.js';
import { resolveConfig } from '@/engine/core/config.js';
import { createRngBundle } from '@/engine/core/rng.js';
import type { AgentAction, AgentId, WorldState } from '@/engine/core/types.js';
import { canonicalJson } from '@/engine/core/hash.js';
import { applyEffects } from '@/engine/mutation/stateMutator.js';
import { EffectProjection } from '@/engine/validation/validateAction.js';
import { initWorld } from '@/engine/world/initWorld.js';

const A: AgentId = 'agent_000';
const B: AgentId = 'agent_001';
const FAR: AgentId = 'agent_002';

let state: WorldState;
let ctx: ActionContext;

function makeCtx(current: WorldState): ActionContext {
  return {
    state: current,
    round: current.round,
    rng: createRngBundle(7),
    projection: new EffectProjection(current),
  };
}

beforeEach(() => {
  state = initWorld(resolveConfig({ seed: 7, agentCount: 4 })).state;
  for (const id of [A, B]) {
    state.agents[id]!.location = 'commons';
    state.agents[id]!.needs = { satiety: 80, energy: 100 };
  }
  state.agents[FAR]!.location = 'outskirts';
  state.agents[B]!.resources = { food: 10, coins: 4, materials: 2 };
  ctx = makeCtx(state);
});

const attack = (target: AgentId): AgentAction => ({
  actorId: A,
  type: 'attack',
  params: { target },
  source: 'scripted',
});

describe('attack — Vorbedingungen', () => {
  it('bietet nur Anwesende an', () => {
    const labels = attackAction.generate(state.agents[A]!, ctx).map((c) => c.label);
    expect(labels).toEqual([`attack:${B}`]);
  });

  it('lehnt einen Angriff auf sich selbst ab', () => {
    expect(attackAction.precondition(attack(A), ctx)).toMatchObject({
      ok: false,
      reason: 'target_invalid',
    });
  });

  it('lehnt ein Ziel an einem anderen Ort ab', () => {
    expect(attackAction.precondition(attack(FAR), ctx)).toMatchObject({
      ok: false,
      reason: 'target_invalid',
    });
  });

  it('lehnt ein ausgeschiedenes Ziel ab', () => {
    applyEffects(state, [{ t: 'eliminate', agentId: B, cause: 'starvation' }]);
    expect(attackAction.precondition(attack(B), ctx)).toMatchObject({
      ok: false,
      reason: 'target_invalid',
    });
  });

  it('lehnt ab, wenn die Energie nicht reicht', () => {
    state.agents[A]!.needs.energy = 19;
    expect(attackAction.precondition(attack(B), ctx)).toMatchObject({
      ok: false,
      reason: 'precondition_failed',
    });
    expect(attackAction.generate(state.agents[A]!, ctx)).toEqual([]);
  });

  it('haelt den Cooldown ein', () => {
    state.agents[A]!.cooldowns = { attack: state.round + 2 };
    expect(attackAction.precondition(attack(B), ctx)).toMatchObject({
      ok: false,
      reason: 'precondition_failed',
    });
    expect(attackAction.generate(state.agents[A]!, ctx)).toEqual([]);
  });
});

describe('attack — Ausgang', () => {
  it('kostet Energie und setzt den Cooldown', () => {
    const { effects } = attackAction.resolve(attack(B), ctx);
    expect(effects[0]).toEqual({ t: 'need', agentId: A, delta: { energy: -20 } });
    expect(effects[1]).toMatchObject({ t: 'cooldown', action: 'attack', readyAtRound: state.round + 3 });
  });

  it('laesst Kraft entscheiden — der Staerkere gewinnt fast immer', () => {
    let wins = 0;
    for (let round = 1; round <= 40; round += 1) {
      state.agents[A]!.experience.strength = 900;
      state.agents[B]!.experience.strength = 200;
      const local = { ...makeCtx(state), round };
      const { events } = attackAction.resolve(attack(B), local);
      if (events[0]?.payload['attackerWins'] === true) wins += 1;
    }
    expect(wins).toBeGreaterThan(35);
  });

  it('kann nach hinten losgehen — der Unterlegene kann der Angreifer sein', () => {
    let backfires = 0;
    for (let round = 1; round <= 40; round += 1) {
      state.agents[A]!.experience.strength = 200;
      state.agents[B]!.experience.strength = 900;
      const local = { ...makeCtx(state), round };
      const { events } = attackAction.resolve(attack(B), local);
      if (events[0]?.payload['loserId'] === A) backfires += 1;
    }
    expect(backfires).toBeGreaterThan(35);
  });

  it('schuetzt den Verteidiger durch Intelligenz', () => {
    const countWins = (defenderIntelligence: number): number => {
      let wins = 0;
      for (let round = 1; round <= 60; round += 1) {
        state.agents[A]!.experience.strength = 600;
        state.agents[B]!.experience.strength = 600;
        state.agents[B]!.experience.intelligence = defenderIntelligence;
        const local = { ...makeCtx(state), round };
        const { events } = attackAction.resolve(attack(B), local);
        if (events[0]?.payload['attackerWins'] === true) wins += 1;
      }
      return wins;
    };

    expect(countWins(1000)).toBeLessThan(countWins(0));
  });

  it('erbeutet einen Teil der Vorraete des Verlierers', () => {
    state.agents[A]!.experience.strength = 950;
    state.agents[B]!.experience.strength = 150;
    const { effects } = attackAction.resolve(attack(B), ctx);

    const loss = effects.find((e) => e.t === 'resource' && e.agentId === B);
    const gain = effects.find((e) => e.t === 'resource' && e.agentId === A);
    expect(loss).toBeDefined();
    expect(gain).toBeDefined();
    if (loss?.t !== 'resource' || gain?.t !== 'resource') throw new Error('unerwartet');
    // Beute ist eine Verschiebung, keine Quelle.
    expect(loss.delta.food).toBe(-(gain.delta.food ?? 0));
  });

  it('toetet, wenn der Schaden den Erschoepften umwirft', () => {
    state.agents[A]!.experience.strength = 900;
    state.agents[B]!.experience.strength = 300;
    state.agents[B]!.needs.energy = 1;

    const { effects, events } = attackAction.resolve(attack(B), ctx);
    expect(events[0]?.type).toBe('agent_killed');
    expect(events[0]?.visibility).toEqual({ scope: 'public' });
    expect(effects.some((e) => e.t === 'eliminate' && e.agentId === B && e.cause === 'killed')).toBe(true);
    expect(effects.some((e) => e.t === 'kill' && e.agentId === A)).toBe(true);
  });

  it('macht aus einem nicht toedlichen Kampf Schaden statt Tod', () => {
    state.agents[A]!.experience.strength = 520;
    state.agents[B]!.experience.strength = 500;
    const { effects, events } = attackAction.resolve(attack(B), ctx);

    expect(events[0]?.type).toBe('agent_attacked');
    expect(effects.some((e) => e.t === 'eliminate')).toBe(false);
    // Der Verlierer kann auch der Angreifer sein — der Schaden trifft ihn,
    // nicht zwangslaeufig das Ziel.
    const loserId = events[0]?.payload['loserId'];
    expect(effects.some((e) => e.t === 'need' && e.agentId === loserId && (e.delta.energy ?? 0) < 0)).toBe(
      true,
    );
  });

  it('macht die Kraft beider Seiten beobachtbar', () => {
    const { events } = attackAction.resolve(attack(B), ctx);
    expect(events[0]?.infoRefs).toEqual([`info_attr_${A}_strength`, `info_attr_${B}_strength`]);
  });

  it('ist rein — der State bleibt unveraendert', () => {
    const before = canonicalJson(state);
    attackAction.generate(state.agents[A]!, ctx);
    attackAction.precondition(attack(B), ctx);
    attackAction.resolve(attack(B), ctx);
    expect(canonicalJson(state)).toBe(before);
  });

  it('ist reproduzierbar', () => {
    const first = attackAction.resolve(attack(B), makeCtx(state));
    const second = attackAction.resolve(attack(B), makeCtx(state));
    expect(canonicalJson(first.effects)).toBe(canonicalJson(second.effects));
  });
});
