/**
 * T05, Teil 2 — ein Agent, vollstaendig aus dem Seed gezogen.
 *
 * Jeder Agent bekommt einen eigenen abgeleiteten RNG-Stream (`agent:<index>`).
 * Dadurch verschiebt eine zusaetzliche Ziehung bei Agent 3 die Werte von Agent 4
 * nicht — dieselbe Eigenschaft wie bei den Rundenstreams, und der Grund, warum
 * die Weltgenerierung spaeter erweitert werden kann, ohne alle Golden-Hashes
 * neu schreiben zu muessen.
 */

import { agentId } from '../core/ids.js';
import type { RngBundle } from '../core/rng.js';
import { PERSONALITY_TRAITS } from '../core/types.js';
import type { Agent, AttributeConfig, LocationId, Personality } from '../core/types.js';
import { ARCHETYPES } from './archetypes.js';
import { startingExperience } from './attributes.js';
import { nameForIndex } from './names.js';

/** Streuung um den Archetyp-Mittelwert, in Stat-Punkten. **[ANNAHME]** */
const TRAIT_JITTER = 15;

export interface CreateAgentOptions {
  index: number;
  rng: RngBundle;
  locations: readonly LocationId[];
  attributes: Readonly<AttributeConfig>;
}

export function createAgent({ index, rng, locations, attributes }: CreateAgentOptions): Agent {
  if (locations.length === 0) {
    throw new RangeError('createAgent: keine Orte vorhanden');
  }

  const stream = rng.derive('agent', index);
  const archetype = stream.pick(ARCHETYPES);

  const personality = {} as Personality;
  for (const trait of PERSONALITY_TRAITS) {
    const mean = archetype.means[trait];
    personality[trait] = clampStat(mean + stream.int(-TRAIT_JITTER, TRAIT_JITTER));
  }

  return {
    id: agentId(index),
    name: nameForIndex(index),
    archetype: archetype.id,
    alive: true,
    location: stream.pick(locations),
    personality,
    // Nicht gezogen: alle starten mit demselben Koennen. Persoenlichkeit ist
    // Veranlagung und darf sich unterscheiden — Faehigkeit wird erworben.
    experience: startingExperience(attributes),
    kills: 0,
    needs: {
      satiety: stream.int(70, 90),
      energy: stream.int(70, 100),
    },
    resources: {
      food: stream.int(2, 6),
      coins: 10,
      materials: stream.int(0, 2),
    },
    status: {
      hungerStreak: 0,
      exhaustionStreak: 0,
      exiledFrom: [],
    },
    // Fresh Match (Doc 06 §6.4): niemand weiss zu Beginn irgendetwas. Auch die
    // Bestaende am eigenen Startort muessen erst beobachtet werden.
    knowledge: {},
    // Ebenso leer: eine Beziehung entsteht erst an der ersten gemeinsamen
    // Interaktion (Phase 8), nicht am Start.
    relationships: {},
    // Ebenso leer: die erste Episode entsteht fruehestens in Phase 9 der
    // ersten Runde (Doc 03 §6.2).
    episodic: [],
    // Ebenso leer: die erste Lesson braucht mindestens eine Episode als Beleg,
    // die es vor Phase 10 der ersten Runde noch nicht gibt.
    lessons: {},
    cooldowns: {},
    allianceId: null,
  };
}

function clampStat(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}
