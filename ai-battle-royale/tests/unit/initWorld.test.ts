import { describe, expect, it } from 'vitest';

import { resolveConfig } from '@/engine/core/config.js';
import { assertInvariants, totalResources } from '@/engine/core/invariants.js';
import { initWorld } from '@/engine/world/initWorld.js';
import { LOCATION_IDS } from '@/engine/world/locations.js';
import { ARCHETYPE_IDS } from '@/engine/agents/archetypes.js';
import { agentIds } from '@/engine/core/access.js';

function world(seed: number, agentCount = 12) {
  return initWorld(resolveConfig({ seed, agentCount })).state;
}

describe('initWorld — gleicher Seed, identische Startwelt', () => {
  it('erzeugt bei gleichem Seed bitgleiche Welten', () => {
    expect(world(42)).toEqual(world(42));
  });

  it('erzeugt bei anderem Seed eine andere Welt', () => {
    expect(world(42)).not.toEqual(world(43));
  });

  it('haengt die MatchId an Seed und Config', () => {
    expect(world(42).matchId).toBe(world(42).matchId);
    expect(world(42).matchId).not.toBe(world(43).matchId);
    expect(world(42, 12).matchId).not.toBe(world(42, 13).matchId);
  });
});

describe('initWorld — Struktur', () => {
  it('legt genau sechs Orte an', () => {
    const state = world(1);
    expect(Object.keys(state.locations).sort()).toEqual([...LOCATION_IDS].sort());
  });

  it('haelt den Ortsgraphen beidseitig', () => {
    const state = world(1);
    for (const location of Object.values(state.locations)) {
      for (const neighbor of location.neighbors) {
        expect(state.locations[neighbor]?.neighbors).toContain(location.id);
      }
    }
  });

  it('legt genau agentCount Agenten an, alle lebend', () => {
    const state = world(1, 30);
    const ids = agentIds(state);
    expect(ids).toHaveLength(30);
    expect(ids[0]).toBe('agent_000');
    expect(ids.at(-1)).toBe('agent_029');
    expect(Object.values(state.agents).every((a) => a?.alive)).toBe(true);
  });

  it('gibt jedem Agenten einen bekannten Archetyp und einen bekannten Ort', () => {
    const state = world(5, 30);
    for (const agent of Object.values(state.agents)) {
      expect(ARCHETYPE_IDS).toContain(agent?.archetype);
      expect(LOCATION_IDS).toContain(agent?.location);
    }
  });

  it('startet in Runde 1 mit laufendem Match', () => {
    const state = world(1);
    expect(state.round).toBe(1);
    expect(state.status).toBe('running');
    expect(state.endReason).toBeUndefined();
  });

  it('haelt alle Invarianten der Startwelt', () => {
    expect(() => assertInvariants(world(99, 40))).not.toThrow();
  });
});

describe('initWorld — Streuung', () => {
  it('zieht unterschiedliche Persoenlichkeiten', () => {
    const state = world(3, 30);
    const ambitions = new Set(Object.values(state.agents).map((a) => a?.personality.ambition));
    expect(ambitions.size).toBeGreaterThan(5);
  });

  it('nutzt mehr als einen Archetyp', () => {
    const state = world(3, 30);
    const kinds = new Set(Object.values(state.agents).map((a) => a?.archetype));
    expect(kinds.size).toBeGreaterThan(1);
  });

  it('verteilt Agenten ueber mehrere Orte', () => {
    const state = world(3, 30);
    const places = new Set(Object.values(state.agents).map((a) => a?.location));
    expect(places.size).toBeGreaterThan(2);
  });

  it('startet mit einer bekannten Muenzmenge', () => {
    // 30 Agenten je 10 Coins plus 20 im Lagerhaus. Muenzen regenerieren nirgends,
    // also ist dieser Wert fuer das ganze Match die Erhaltungsgroesse.
    expect(totalResources(world(3, 30)).coins).toBe(320);
  });
});
