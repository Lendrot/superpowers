/**
 * T05 — Weltgenerierung. Gleicher Seed ⇒ identische Startwelt.
 *
 * Die Startbestaende der Agenten entstehen hier "aus dem Nichts". Das ist kein
 * Bruch der Erhaltungsregel: die Regel gilt ab dem Startzustand, und dieser
 * Startzustand ist der Bezugspunkt. Nach der Initialisierung darf Ressource nur
 * noch ueber deklarierte Quellen (`regen`) und Senken entstehen bzw. vergehen.
 */

import { createAgent } from '../agents/createAgent.js';
import { assertInvariants } from '../core/invariants.js';
import { matchId as makeMatchId } from '../core/ids.js';
import { createRngBundle } from '../core/rng.js';
import type { RngBundle } from '../core/rng.js';
import { RESOURCE_KINDS } from '../core/resources.js';
import type { MatchConfig, WorldState } from '../core/types.js';
import { stockInfoItem } from '../information/infoRegistry.js';
import { LOCATION_IDS, createLocations } from './locations.js';

export interface InitWorldResult {
  state: WorldState;
  /** Dasselbe Bundle, mit dem die Welt erzeugt wurde — der Runner arbeitet damit weiter. */
  rng: RngBundle;
}

export function initWorld(config: MatchConfig): InitWorldResult {
  const rng = createRngBundle(config.seed);
  const locations = createLocations();

  const agents: WorldState['agents'] = {};
  for (let index = 0; index < config.agentCount; index += 1) {
    const agent = createAgent({ index, rng, locations: LOCATION_IDS });
    agents[agent.id] = agent;
  }

  // Die Bestaende der sechs Orte sind von Anfang an Tatsachen der Welt — sie
  // entstehen nicht erst, wenn jemand hinsieht. Registriert heisst nicht
  // bekannt: kein Agent hat dazu einen `KnowledgeEntry`, bis Phase 2 einen
  // schreibt.
  const infoRegistry: WorldState['infoRegistry'] = {};
  for (const locationId of LOCATION_IDS) {
    for (const kind of RESOURCE_KINDS) {
      const item = stockInfoItem(locationId, kind, 1);
      infoRegistry[item.id] = item;
    }
  }

  const state: WorldState = {
    matchId: makeMatchId(config.seed, config),
    seed: config.seed,
    round: 1,
    config,
    rngState: rng.snapshot(),
    agents,
    locations,
    infoRegistry,
    status: 'running',
  };

  // Eine Startwelt, die bereits eine Invariante verletzt, wuerde spaeter als
  // Fehler in Runde 1 erscheinen und dort gesucht werden.
  assertInvariants(state);

  return { state, rng };
}
