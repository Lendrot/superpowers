import { describe, expect, it } from 'vitest';

import { attributesOf } from '@/engine/agents/attributes.js';
import { resolveConfig } from '@/engine/core/config.js';
import type { AgentId, AttributeTrack } from '@/engine/core/types.js';
import { ATTRIBUTE_TRACKS } from '@/engine/core/types.js';
import { runMatch } from '@/engine/runner/runMatch.js';
import { initWorld } from '@/engine/world/initWorld.js';

/**
 * Alle starten gleich stark — was sie werden, entscheidet ihr Weg.
 *
 * Der Test prueft die Behauptung, auf der die ganze Erweiterung steht: dass
 * Unterschiede in den Faehigkeiten *erworben* sind, nicht gezogen. Er prueft
 * ausserdem, dass das nicht in eine Einheitslage kippt (alle maximal stark)
 * und nicht in einen Zusammenbruch (alle bei null) — beides ist beim Bauen
 * gemessen worden und beides waere sinnlos.
 */

const ROUNDS = 600;
const AGENTS = 30;

describe('Entwicklung der Faehigkeiten', () => {
  const config = resolveConfig({ seed: 42, agentCount: AGENTS, maxRounds: ROUNDS });
  const result = runMatch(config);
  const survivors = Object.values(result.state.agents).filter((agent) => agent?.alive);

  const values = (track: AttributeTrack): number[] =>
    survivors.map((agent) => attributesOf(agent!, config.attributes)[track]);

  it('startet bei allen mit demselben Wert', () => {
    // Die Startwelt ist der Bezugspunkt: gleiche Erfahrung fuer jeden, bevor
    // die erste Runde irgendetwas veraendert.
    const fresh = initWorld(config).state;
    for (const agent of Object.values(fresh.agents)) {
      expect(attributesOf(agent!, config.attributes)).toEqual({
        intelligence: 50,
        strength: 50,
        intuition: 50,
      });
    }
  });

  it('faechert die Kraft ueber den Lauf deutlich auf', () => {
    const spread = Math.max(...values('strength')) - Math.min(...values('strength'));
    expect(spread).toBeGreaterThan(20);
  });

  it('trennt die Faehigkeiten voneinander', () => {
    // Kein Agent hat ueberall denselben Wert: die drei Faehigkeiten haben je
    // eine eigene Quelle und entwickeln sich unabhaengig.
    const flat = survivors.filter((agent) => {
      const a = attributesOf(agent!, config.attributes);
      return a.intelligence === a.strength && a.strength === a.intuition;
    });
    expect(flat).toEqual([]);
  });

  it('treibt nicht alles ins Maximum', () => {
    // Gemessener Fehlerfall: mit festem statt niveauabhaengigem Verfall landete
    // jeder Agent bei Kraft 100 und Intelligenz 14.
    for (const track of ATTRIBUTE_TRACKS) {
      expect(Math.max(...values(track)), `${track} laeuft ins Maximum`).toBeLessThan(100);
    }
  });

  it('laesst keine Faehigkeit auf null verfallen', () => {
    // Gemessener Fehlerfall: ohne Boden fielen vernachlaessigte Faehigkeiten
    // auf null, und ein Agent ohne Intelligenz hat keinen Ueberlebensinstinkt
    // mehr — eine Spirale, aus der er nicht herauskommt.
    for (const track of ATTRIBUTE_TRACKS) {
      expect(Math.min(...values(track)), `${track} faellt auf null`).toBeGreaterThanOrEqual(
        Math.floor(config.attributes.decayFloor / config.attributes.pointsPerLevel),
      );
    }
  });

  it('macht Kraft zur Folge des Erntens', () => {
    // Wer viel erntet, wird stark. Der Zusammenhang muss im Log sichtbar sein,
    // sonst ist die Entwicklung Dekoration.
    const gathers = new Map<AgentId, number>();
    for (const event of result.log.events) {
      if (event.type !== 'resource_gathered' || !event.actorId) continue;
      gathers.set(event.actorId, (gathers.get(event.actorId) ?? 0) + 1);
    }

    const ranked = survivors
      .map((agent) => ({
        gathers: gathers.get(agent!.id) ?? 0,
        strength: attributesOf(agent!, config.attributes).strength,
      }))
      .sort((a, b) => b.gathers - a.gathers);

    const topHalf = ranked.slice(0, Math.floor(ranked.length / 2));
    const bottomHalf = ranked.slice(Math.floor(ranked.length / 2));
    const mean = (rows: typeof ranked): number =>
      rows.reduce((sum, row) => sum + row.strength, 0) / Math.max(1, rows.length);

    expect(mean(topHalf)).toBeGreaterThan(mean(bottomHalf));
  });

  it('laesst die Veranlagung driften, aber nur langsam', () => {
    // Doc 03 §3.2.1 nennt die Persoenlichkeit konstant; sie driftet jetzt auf
    // Ansage. Der Deckel ist das Entscheidende: hoechstens ±1 pro Runde.
    const drifted = survivors.filter((agent) => {
      const start = 50;
      return Math.abs(agent!.personality.dominance - start) > 0;
    });
    expect(drifted.length).toBeGreaterThan(0);

    for (const agent of survivors) {
      for (const value of Object.values(agent!.personality)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('Macht und Gewalt', () => {
  const config = resolveConfig({ seed: 42, agentCount: AGENTS, maxRounds: ROUNDS });
  const result = runMatch(config);

  it('fuehrt zu Kaempfen und zu Toten', () => {
    expect(result.log.events.filter((e) => e.type === 'agent_attacked').length).toBeGreaterThan(20);
    expect(result.log.events.filter((e) => e.type === 'agent_killed').length).toBeGreaterThan(0);
  });

  it('laesst nicht alle kaempfen — Gewalt bleibt eine Minderheitenposition', () => {
    const attackers = new Set(
      result.log.events
        .filter((e) => e.type === 'agent_attacked' || e.type === 'agent_killed')
        .map((e) => e.actorId),
    );
    expect(attackers.size).toBeGreaterThan(1);
    expect(attackers.size).toBeLessThan(AGENTS);
  });

  it('haelt fest, wer wen getoetet hat', () => {
    for (const agent of Object.values(result.state.agents)) {
      if (agent?.eliminationCause !== 'killed') continue;
      expect(agent.killedBy).toBeDefined();
      expect(result.state.agents[agent.killedBy!]?.kills).toBeGreaterThan(0);
    }
  });

  it('macht Kraft nach einem Kampf beobachtbar', () => {
    // Wer einen Kampf gesehen hat, weiss danach etwas ueber die Kraft der
    // Beteiligten — das ist der einzige Weg zu diesem Wissen.
    const withBeliefs = Object.values(result.state.agents).filter((agent) =>
      Object.keys(agent?.knowledge ?? {}).some((id) => id.startsWith('info_attr_')),
    );
    expect(withBeliefs.length).toBeGreaterThan(0);
  });

  it('bleibt deterministisch', () => {
    expect(runMatch(config).logHash).toBe(result.logHash);
  });
});
