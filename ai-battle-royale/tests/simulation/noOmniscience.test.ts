import { describe, expect, it } from 'vitest';

import { resolveConfig } from '@/engine/core/config.js';
import type { AgentId, LocationId, WorldEvent } from '@/engine/core/types.js';
import { runMatch } from '@/engine/runner/runMatch.js';
import { initWorld } from '@/engine/world/initWorld.js';

/**
 * Gate aus Doc 12, Tag 2 — `no-omniscience` (Doc 08 §8.4, Doc 13 §4).
 *
 * Gefordert: jeder Wissenseintrag eines Agenten ist auf ein Ereignis
 * zurueckfuehrbar, in dessen Beobachterset er war.
 *
 * Entscheidend ist, **womit** geprueft wird. Die Perception-Funktion noch einmal
 * aufzurufen und mit sich selbst zu vergleichen, wuerde nichts beweisen. Dieser
 * Test rekonstruiert die Aufenthaltsorte statt dessen unabhaengig aus dem
 * Event-Log: die Startpositionen stehen in der erzeugten Welt, jeder spaetere
 * Wechsel in einem `agent_moved`-Event. Daraus ergibt sich fuer jede Runde, wer
 * wo stand — und damit, wer was gesehen haben kann.
 *
 * Der Zeitbezug: Phase 2 der Runde N verarbeitet die Events der Runde N−1 und
 * loest Ortssichtbarkeit gegen die Positionen zu Beginn von N auf. Weil
 * Ortswechsel in Klasse 1 aufgeloest werden, sind das genau die Positionen, die
 * waehrend N−1 galten — die Rekonstruktion nach Runde N−1 ist also der richtige
 * Vergleichsmassstab.
 */

const ROUNDS = 200;
const AGENTS = 24;

function positionsByRound(
  start: Record<AgentId, LocationId>,
  events: readonly WorldEvent[],
  lastRound: number,
): Map<number, Record<AgentId, LocationId>> {
  const timeline = new Map<number, Record<AgentId, LocationId>>();
  const current = { ...start };

  for (let round = 1; round <= lastRound; round += 1) {
    for (const event of events) {
      if (event.round !== round || event.type !== 'agent_moved') continue;
      const actor = event.actorId;
      const to = event.payload['to'];
      if (actor && typeof to === 'string') current[actor] = to as LocationId;
    }
    // Stand am Ende der Runde = Stand, unter dem die Events dieser Runde
    // entstanden sind (Ortswechsel loesen vor allem anderen auf).
    timeline.set(round, { ...current });
  }

  return timeline;
}

describe('no-omniscience', () => {
  const config = resolveConfig({ seed: 4242, agentCount: AGENTS, maxRounds: ROUNDS });
  const startPositions: Record<AgentId, LocationId> = {};
  for (const [id, agent] of Object.entries(initWorld(config).state.agents)) {
    if (agent) startPositions[id as AgentId] = agent.location;
  }

  const result = runMatch(config);
  const events = result.log.events;
  const byId = new Map(events.map((event) => [event.id, event]));
  const timeline = positionsByRound(startPositions, events, ROUNDS);

  it('laeuft lange genug, um etwas zu beweisen', () => {
    expect(result.rounds).toBe(ROUNDS);
    const withKnowledge = Object.values(result.state.agents).filter(
      (agent) => agent && Object.keys(agent.knowledge).length > 0,
    );
    expect(withKnowledge.length).toBeGreaterThan(AGENTS / 2);
  });

  it('fuehrt jeden Wissenseintrag auf ein reales Ereignis zurueck', () => {
    for (const agent of Object.values(result.state.agents)) {
      if (!agent) continue;
      for (const entry of Object.values(agent.knowledge)) {
        expect(entry.sourceEventId, `${agent.id} kennt ${entry.infoId} ohne Herkunft`).toBeDefined();
        expect(byId.has(entry.sourceEventId!)).toBe(true);
      }
    }
  });

  it('gibt keinem Agenten Wissen aus einem Ereignis, das er nicht wahrnehmen konnte', () => {
    const violations: string[] = [];

    for (const agent of Object.values(result.state.agents)) {
      if (!agent) continue;

      for (const entry of Object.values(agent.knowledge)) {
        const event = byId.get(entry.sourceEventId!);
        if (!event) continue;

        // T18: Hoerensagen laeuft NICHT ueber `infoRefs` — absichtlich, siehe
        // `shareInformation.ts`. Waere die InfoId dort eingetragen, wuerde
        // Phase 2 die Weltwahrheit an ALLE Anwesenden verteilen statt nur an
        // den tatsaechlichen Empfaenger. Die Legitimation prueft hier deshalb
        // anders: das Ereignis muss ein echtes `information_shared` sein, DAS
        // AGENT ALS ZIEL traegt, fuer genau diese Info, von genau der
        // behaupteten Quelle.
        if (entry.source === 'told_by') {
          if (event.type !== 'information_shared') {
            violations.push(`${agent.id}: ${entry.infoId} told_by aus ${event.id} (${event.type}), kein information_shared`);
          } else if (event.targetId !== agent.id) {
            violations.push(`${agent.id}: ${entry.infoId} aus ${event.id}, war aber nicht dessen Ziel`);
          } else if (event.payload['infoId'] !== entry.infoId) {
            violations.push(`${agent.id}: ${entry.infoId} aus ${event.id}, das eine andere Info betraf`);
          } else if (event.actorId !== entry.sourceAgent) {
            violations.push(
              `${agent.id}: ${entry.infoId} nennt Quelle ${entry.sourceAgent}, Event ${event.id} sagt ${event.actorId}`,
            );
          }
          continue;
        }

        // Das Ereignis muss die Info ueberhaupt betreffen.
        if (!event.infoRefs.includes(entry.infoId)) {
          violations.push(`${agent.id}: ${entry.infoId} aus ${event.id}, das sie nicht beruehrt`);
          continue;
        }

        switch (event.visibility.scope) {
          case 'public':
            break;
          case 'location': {
            const where = timeline.get(event.round)?.[agent.id];
            if (where !== event.visibility.locationId) {
              violations.push(
                `${agent.id}: ${entry.infoId} aus ${event.id} an ${event.visibility.locationId}, ` +
                  `stand aber in Runde ${event.round} an ${where ?? 'unbekannt'}`,
              );
            }
            break;
          }
          case 'participants':
            if (event.actorId !== agent.id && event.targetId !== agent.id) {
              violations.push(`${agent.id}: ${entry.infoId} aus ${event.id} ohne Beteiligung`);
            }
            break;
          case 'private':
            if (!event.visibility.agentIds.includes(agent.id)) {
              violations.push(`${agent.id}: ${entry.infoId} aus privatem ${event.id}`);
            }
            break;
          case 'alliance':
            if (agent.allianceId !== event.visibility.allianceId) {
              violations.push(`${agent.id}: ${entry.infoId} aus fremder Allianz`);
            }
            break;
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('gibt keinem Agenten Wissen ueber einen Ort, an dem er nie war', () => {
    // Die schaerfere Fassung derselben Regel: ein Bestand ist nur bekannt, wenn
    // der Agent irgendwann dort gestanden hat.
    const visited = new Map<AgentId, Set<LocationId>>();
    for (const [id, location] of Object.entries(startPositions)) {
      visited.set(id as AgentId, new Set([location]));
    }
    for (const event of events) {
      if (event.type !== 'agent_moved' || !event.actorId) continue;
      const to = event.payload['to'];
      if (typeof to === 'string') visited.get(event.actorId)?.add(to as LocationId);
    }

    for (const agent of Object.values(result.state.agents)) {
      if (!agent) continue;
      for (const entry of Object.values(agent.knowledge)) {
        // T18: das Hoerensagen-Versprechen ist genau die Ausnahme von dieser
        // Regel — wissen, ohne dort gewesen zu sein, aber ueber eine echte
        // Kette. Die vorige Pruefung deckt diese Kette bereits ab.
        if (entry.source === 'told_by') continue;
        const item = result.state.infoRegistry[entry.infoId];
        if (item?.topic !== 'stock_at_location') continue;
        expect(
          visited.get(agent.id)?.has(item.subject.ref as LocationId),
          `${agent.id} kennt den Bestand an ${item.subject.ref}, war aber nie dort`,
        ).toBe(true);
      }
    }
  });

  it('haelt den Wissensumfang gedeckelt', () => {
    // Es gibt 6 Orte × 3 Ressourcen plus ein Ereignis je ausgeschiedenem Agenten.
    // Wissen kann also nicht unbegrenzt wachsen — das ist die Vorbedingung
    // dafuer, dass Memory (T22) spaeter ueberhaupt eine Obergrenze halten kann.
    for (const agent of Object.values(result.state.agents)) {
      if (!agent) continue;
      expect(Object.keys(agent.knowledge).length).toBeLessThanOrEqual(18 + AGENTS);
    }
  });

  it('laeuft lange genug, um auch fuer Episoden etwas zu beweisen', () => {
    const withEpisodes = Object.values(result.state.agents).filter(
      (agent) => agent && agent.episodic.length > 0,
    );
    expect(withEpisodes.length).toBeGreaterThan(0);
  });

  it('fuehrt jede Episode auf ein reales Ereignis zurueck, das der Agent wahrnehmen konnte (T22)', () => {
    // Dieselbe Rekonstruktion wie oben fuer `knowledge`, jetzt fuer
    // `episodic` — unabhaengig von `memory/episodes.ts` nachgerechnet, sonst
    // bewiese der Test nur, dass die Implementierung sich selbst zustimmt.
    const violations: string[] = [];
    const toldTypes = new Set(['information_shared', 'information_refused']);

    for (const agent of Object.values(result.state.agents)) {
      if (!agent) continue;

      for (const episode of agent.episodic) {
        const event = byId.get(episode.id);
        if (!event) {
          violations.push(`${agent.id}: Episode ${episode.id} verweist auf kein reales Event`);
          continue;
        }
        if (event.type !== episode.eventType || event.round !== episode.round) {
          violations.push(`${agent.id}: Episode ${episode.id} weicht von Event ${event.id} ab`);
          continue;
        }

        const expectedRole =
          event.actorId === agent.id
            ? 'actor'
            : event.targetId === agent.id
              ? toldTypes.has(event.type)
                ? 'told'
                : 'target'
              : 'witness';
        if (episode.role !== expectedRole) {
          violations.push(`${agent.id}: Episode ${episode.id} hat Rolle ${episode.role}, erwartet ${expectedRole}`);
        }

        switch (event.visibility.scope) {
          case 'public':
            break;
          case 'location': {
            const where = timeline.get(event.round)?.[agent.id];
            if (where !== event.visibility.locationId) {
              violations.push(
                `${agent.id}: Episode ${episode.id} aus ${event.id} an ${event.visibility.locationId}, ` +
                  `stand aber in Runde ${event.round} an ${where ?? 'unbekannt'}`,
              );
            }
            break;
          }
          case 'participants':
            if (event.actorId !== agent.id && event.targetId !== agent.id) {
              violations.push(`${agent.id}: Episode ${episode.id} ohne Beteiligung`);
            }
            break;
          case 'private':
            if (!event.visibility.agentIds.includes(agent.id)) {
              violations.push(`${agent.id}: Episode ${episode.id} aus privatem ${event.id}`);
            }
            break;
          case 'alliance':
            if (agent.allianceId !== event.visibility.allianceId) {
              violations.push(`${agent.id}: Episode ${episode.id} aus fremder Allianz`);
            }
            break;
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('haelt die Episodenzahl je Agent in einem grosszuegigen Rahmen um maxEpisodes (T22)', () => {
    for (const agent of Object.values(result.state.agents)) {
      if (!agent) continue;
      expect(agent.episodic.length).toBeLessThanOrEqual(2 * config.memory.maxEpisodes);
    }
  });

  it('erzeugt Wissen, das dem Weltzustand widerspricht — Irrtum ist erlaubt', () => {
    // Wenn niemand je eine veraltete Ueberzeugung haette, waere das Wissenssystem
    // nur eine teure Kopie der Weltwahrheit. Genau die Abweichung ist der Punkt.
    let stale = 0;
    for (const agent of Object.values(result.state.agents)) {
      if (!agent) continue;
      for (const entry of Object.values(agent.knowledge)) {
        const item = result.state.infoRegistry[entry.infoId];
        if (item?.topic !== 'stock_at_location') continue;
        const location = result.state.locations[item.subject.ref as LocationId];
        if (location && location.stock[kindOf(entry.infoId)] !== entry.believedValue) stale += 1;
      }
    }
    expect(stale).toBeGreaterThan(0);
  });
});

function kindOf(infoId: string): 'food' | 'coins' | 'materials' {
  if (infoId.endsWith('_coins')) return 'coins';
  if (infoId.endsWith('_materials')) return 'materials';
  return 'food';
}
