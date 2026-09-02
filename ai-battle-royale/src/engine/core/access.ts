/**
 * Zugriffshelfer.
 *
 * `noUncheckedIndexedAccess` macht jeden Record-Zugriff zu `T | undefined`. Das
 * ist beabsichtigt: ein fehlender Agent ist ein Fehler, der sofort auffallen
 * soll, statt sich als `undefined` durch drei Phasen zu schleichen.
 */

import type { Agent, AgentId, Location, LocationId, WorldState } from './types.js';

export function getAgent(state: Readonly<WorldState>, id: AgentId): Agent {
  const agent = state.agents[id];
  if (!agent) {
    throw new Error(`Unbekannter Agent: ${id}`);
  }
  return agent;
}

export function getLocation(state: Readonly<WorldState>, id: LocationId): Location {
  const location = state.locations[id];
  if (!location) {
    throw new Error(`Unbekannter Ort: ${id}`);
  }
  return location;
}

/** Alle AgentIds in stabiler (aufsteigender) Reihenfolge — nie Objektreihenfolge. */
export function agentIds(state: Readonly<WorldState>): AgentId[] {
  return (Object.keys(state.agents) as AgentId[]).sort();
}

export function aliveAgents(state: Readonly<WorldState>): Agent[] {
  return agentIds(state)
    .map((id) => getAgent(state, id))
    .filter((agent) => agent.alive);
}

export function locationIds(state: Readonly<WorldState>): LocationId[] {
  return (Object.keys(state.locations) as LocationId[]).sort();
}

/** Wer ist gerade an diesem Ort — abgeleitet, nie gespeichert (Doc 03 §3.9). */
export function occupantsOf(state: Readonly<WorldState>, locationId: LocationId): Agent[] {
  return aliveAgents(state).filter((agent) => agent.location === locationId);
}
