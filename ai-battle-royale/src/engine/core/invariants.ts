/**
 * T06 — `assertInvariants`, die harte Zusicherung nach jeder Mutation.
 *
 * Doc 03 §3.1 und Doc 10 §C. Ein Invariantenbruch ist kein Betriebszustand,
 * sondern ein Bug: die Funktion wirft, sie repariert nichts. Wer hier repariert,
 * verdeckt genau den Fehler, den der deterministische Kern sichtbar machen soll.
 */

import { RESOURCE_KINDS } from './resources.js';
import { ATTRIBUTE_TRACKS } from './types.js';
import type { Resources, WorldState } from './types.js';

export class InvariantError extends Error {
  constructor(message: string) {
    super(`Invariante verletzt: ${message}`);
    this.name = 'InvariantError';
  }
}

export function assertInvariants(state: Readonly<WorldState>): void {
  if (!Number.isInteger(state.round) || state.round < 1) {
    throw new InvariantError(`round muss eine ganze Zahl >= 1 sein, war ${state.round}`);
  }
  if (state.status === 'running' && state.endReason !== undefined) {
    throw new InvariantError('laufendes Match hat einen endReason');
  }

  for (const [key, agent] of Object.entries(state.agents)) {
    if (!agent) continue;
    const who = `Agent ${key}`;

    if (agent.id !== key) {
      throw new InvariantError(`${who}: Schluessel und agent.id weichen ab (${agent.id})`);
    }
    if (!state.locations[agent.location]) {
      throw new InvariantError(`${who}: unbekannter Ort ${agent.location}`);
    }

    for (const kind of RESOURCE_KINDS) {
      const value = agent.resources[kind];
      if (!Number.isInteger(value) || value < 0) {
        throw new InvariantError(`${who}: resources.${kind} = ${value} (muss ganze Zahl >= 0 sein)`);
      }
    }

    for (const need of ['satiety', 'energy'] as const) {
      const value = agent.needs[need];
      if (!Number.isInteger(value) || value < 0 || value > 100) {
        throw new InvariantError(`${who}: needs.${need} = ${value} (muss ganze Zahl in 0..100 sein)`);
      }
    }

    for (const trait of Object.values(agent.personality)) {
      if (!Number.isInteger(trait) || trait < 0 || trait > 100) {
        throw new InvariantError(`${who}: Persoenlichkeitswert ${trait} ausserhalb 0..100`);
      }
    }

    if (agent.status.hungerStreak < 0 || agent.status.exhaustionStreak < 0) {
      throw new InvariantError(`${who}: negativer Streak-Zaehler`);
    }

    for (const track of ATTRIBUTE_TRACKS) {
      const points = agent.experience[track];
      if (!Number.isInteger(points) || points < 0 || points > state.config.attributes.maxExperience) {
        throw new InvariantError(
          `${who}: experience.${track} = ${points} (erlaubt 0..${state.config.attributes.maxExperience})`,
        );
      }
    }

    if (!Number.isInteger(agent.kills) || agent.kills < 0) {
      throw new InvariantError(`${who}: kills = ${agent.kills}`);
    }
    if (agent.killedBy !== undefined && agent.eliminationCause !== 'killed') {
      throw new InvariantError(`${who}: killedBy gesetzt, aber nicht getoetet`);
    }
    if (agent.eliminationCause === 'killed' && agent.killedBy === undefined) {
      throw new InvariantError(`${who}: getoetet, aber ohne Taeter`);
    }

    // alive und eliminatedRound duerfen nicht auseinanderlaufen — sonst zaehlt
    // die Scoring-Phase Ueberlebende, die es nicht gibt.
    if (agent.alive && (agent.eliminatedRound !== undefined || agent.eliminationCause !== undefined)) {
      throw new InvariantError(`${who}: lebt, traegt aber Ausscheide-Daten`);
    }
    if (!agent.alive && (agent.eliminatedRound === undefined || agent.eliminationCause === undefined)) {
      throw new InvariantError(`${who}: ausgeschieden ohne Runde/Ursache`);
    }
  }

  for (const [key, location] of Object.entries(state.locations)) {
    if (!location) continue;
    const where = `Ort ${key}`;

    if (location.id !== key) {
      throw new InvariantError(`${where}: Schluessel und location.id weichen ab (${location.id})`);
    }

    for (const kind of RESOURCE_KINDS) {
      const value = location.stock[kind];
      const cap = location.capacity[kind];
      if (!Number.isInteger(value) || value < 0) {
        throw new InvariantError(`${where}: stock.${kind} = ${value} (muss ganze Zahl >= 0 sein)`);
      }
      if (value > cap) {
        throw new InvariantError(`${where}: stock.${kind} = ${value} ueber capacity ${cap}`);
      }
    }

    for (const neighbor of location.neighbors) {
      const other = state.locations[neighbor];
      if (!other) {
        throw new InvariantError(`${where}: unbekannter Nachbar ${neighbor}`);
      }
      if (!other.neighbors.includes(location.id)) {
        throw new InvariantError(`${where}: Nachbarschaft zu ${neighbor} ist nicht beidseitig`);
      }
    }
  }
}

/**
 * Gesamtbestand einer Ressource ueber Agenten und Orte.
 * Grundlage der Erhaltungspruefung im StateMutator.
 */
export function totalResources(state: Readonly<WorldState>): Resources {
  const total: Resources = { food: 0, coins: 0, materials: 0 };
  for (const agent of Object.values(state.agents)) {
    if (!agent) continue;
    for (const kind of RESOURCE_KINDS) total[kind] += agent.resources[kind];
  }
  for (const location of Object.values(state.locations)) {
    if (!location) continue;
    for (const kind of RESOURCE_KINDS) total[kind] += location.stock[kind];
  }
  return total;
}
