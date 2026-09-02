import { beforeEach, describe, expect, it } from 'vitest';

import {
  attributeValue,
  attributesOf,
  clampExperienceDelta,
  instinctsOf,
  luckyDraws,
  luckyRoll,
  powerOf,
  startingExperience,
} from '@/engine/agents/attributes.js';
import { DEFAULT_ATTRIBUTES, resolveConfig } from '@/engine/core/config.js';
import { createRngBundle } from '@/engine/core/rng.js';
import type { AgentId, WorldState } from '@/engine/core/types.js';
import { decayFor } from '@/engine/world/consequence.js';
import { initWorld } from '@/engine/world/initWorld.js';

const A: AgentId = 'agent_000';
let state: WorldState;

beforeEach(() => {
  state = initWorld(resolveConfig({ seed: 9, agentCount: 6 })).state;
});

describe('Alle starten gleich stark', () => {
  it('gibt jedem Agenten dieselbe Erfahrung', () => {
    const values = Object.values(state.agents).map((a) => JSON.stringify(a?.experience));
    expect(new Set(values).size).toBe(1);
  });

  it('setzt jede Faehigkeit auf 50', () => {
    for (const agent of Object.values(state.agents)) {
      expect(attributesOf(agent!, state.config.attributes)).toEqual({
        intelligence: 50,
        strength: 50,
        intuition: 50,
      });
    }
  });

  it('zieht Persoenlichkeit, aber nicht Faehigkeit', () => {
    // Veranlagung unterscheidet sich, Koennen nicht: wer stark wird, ist es
    // geworden.
    const personalities = new Set(
      Object.values(state.agents).map((a) => JSON.stringify(a?.personality)),
    );
    expect(personalities.size).toBeGreaterThan(1);
  });

  it('leitet den Attributwert aus der Erfahrung ab', () => {
    expect(attributeValue(0, DEFAULT_ATTRIBUTES)).toBe(0);
    expect(attributeValue(500, DEFAULT_ATTRIBUTES)).toBe(50);
    expect(attributeValue(1000, DEFAULT_ATTRIBUTES)).toBe(100);
    expect(attributeValue(9_999, DEFAULT_ATTRIBUTES)).toBe(100);
    expect(startingExperience(DEFAULT_ATTRIBUTES).strength).toBe(500);
  });
});

describe('Instinkte folgen den Faehigkeiten', () => {
  it('Intelligenz → Ueberlebensinstinkt, Kraft → Machtinstinkt, Intuition → Glueck', () => {
    expect(instinctsOf({ intelligence: 80, strength: 20, intuition: 60 })).toEqual({
      survival: 0.8,
      power: 0.2,
      luck: 0.6,
    });
  });

  it('veraendert sich, wenn sich die Faehigkeiten veraendern', () => {
    const before = instinctsOf(attributesOf(state.agents[A]!, state.config.attributes));
    state.agents[A]!.experience.strength = 900;
    const after = instinctsOf(attributesOf(state.agents[A]!, state.config.attributes));

    expect(after.power).toBeGreaterThan(before.power);
  });
});

describe('Glueck wirkt auf Wuerfe', () => {
  it('gibt mehr Versuche, je hoeher die Intuition', () => {
    expect(luckyDraws(0)).toBe(1);
    expect(luckyDraws(0.5)).toBe(2);
    expect(luckyDraws(1)).toBe(3);
  });

  it('liefert im Mittel bessere Wuerfe', () => {
    const mean = (luck: number): number => {
      let sum = 0;
      for (let i = 0; i < 2000; i += 1) {
        sum += luckyRoll(createRngBundle(1).derive('t', i), luck);
      }
      return sum / 2000;
    };

    const unlucky = mean(0);
    const lucky = mean(1);
    expect(lucky).toBeGreaterThan(unlucky);
    // Bester aus drei Wuerfen: Erwartungswert 3/4 gegen 1/2.
    expect(lucky).toBeGreaterThan(0.7);
    expect(unlucky).toBeLessThan(0.55);
  });

  it('bleibt in [0, 1) und ist reproduzierbar', () => {
    const roll = (): number => luckyRoll(createRngBundle(5).derive('t', 1), 0.8);
    expect(roll()).toBe(roll());
    expect(roll()).toBeGreaterThanOrEqual(0);
    expect(roll()).toBeLessThan(1);
  });
});

describe('Macht', () => {
  it('waechst mit Kraft, Besitz und Toetungen', () => {
    const base = { experience: startingExperience(DEFAULT_ATTRIBUTES), resources: { food: 0, coins: 0, materials: 0 }, kills: 0, alive: true };
    const weak = powerOf(base, DEFAULT_ATTRIBUTES);

    expect(powerOf({ ...base, experience: { ...base.experience, strength: 1000 } }, DEFAULT_ATTRIBUTES)).toBeGreaterThan(weak);
    expect(powerOf({ ...base, resources: { food: 50, coins: 50, materials: 0 } }, DEFAULT_ATTRIBUTES)).toBeGreaterThan(weak);
    expect(powerOf({ ...base, kills: 3 }, DEFAULT_ATTRIBUTES)).toBeGreaterThan(weak);
  });

  it('ist null fuer Ausgeschiedene', () => {
    const dead = { experience: startingExperience(DEFAULT_ATTRIBUTES), resources: { food: 99, coins: 99, materials: 99 }, kills: 5, alive: false };
    expect(powerOf(dead, DEFAULT_ATTRIBUTES)).toBe(0);
  });

  it('bleibt in [0, 1]', () => {
    const maxed = { experience: { intelligence: 1000, strength: 1000, intuition: 1000 }, resources: { food: 999, coins: 999, materials: 999 }, kills: 99, alive: true };
    expect(powerOf(maxed, DEFAULT_ATTRIBUTES)).toBeLessThanOrEqual(1);
    expect(powerOf(maxed, DEFAULT_ATTRIBUTES)).toBeGreaterThan(0.9);
  });
});

describe('Verfall', () => {
  it('waechst mit dem Niveau', () => {
    expect(decayFor(1000, DEFAULT_ATTRIBUTES)).toBe(4);
    expect(decayFor(500, DEFAULT_ATTRIBUTES)).toBe(2);
  });

  it('hoert unterhalb der Grundkompetenz auf', () => {
    // Ohne Boden faellt eine vernachlaessigte Faehigkeit auf null — und ein
    // Agent ohne Intelligenz hat keinen Ueberlebensinstinkt mehr.
    expect(decayFor(DEFAULT_ATTRIBUTES.decayFloor, DEFAULT_ATTRIBUTES)).toBe(0);
    expect(decayFor(DEFAULT_ATTRIBUTES.decayFloor - 1, DEFAULT_ATTRIBUTES)).toBe(0);
    expect(decayFor(DEFAULT_ATTRIBUTES.decayFloor + 100, DEFAULT_ATTRIBUTES)).toBeGreaterThan(0);
  });

  it('haelt Erfahrungsdeltas in den Grenzen', () => {
    expect(clampExperienceDelta(995, 20, DEFAULT_ATTRIBUTES)).toBe(5);
    expect(clampExperienceDelta(3, -20, DEFAULT_ATTRIBUTES)).toBe(-3);
    expect(clampExperienceDelta(500, 10, DEFAULT_ATTRIBUTES)).toBe(10);
  });
});
