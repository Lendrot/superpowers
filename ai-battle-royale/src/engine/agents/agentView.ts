/**
 * Doc 05 §5.1, Schritt 0 — `AgentView`: die abgeschottete Sicht eines Agenten.
 *
 * Das ist die strukturelle Antwort auf Doc 13 §4 ("Agenten mit unzulaessigem
 * Wissen", laut Spec der haeufigste Fehler solcher Systeme): die Policy und
 * spaeter der LLM-Prompt bekommen **nur** dieses Objekt. Der volle `WorldState`
 * passt gar nicht durch die Signatur.
 *
 * Drin ist ausschliesslich, was der Agent selbst wahrnehmen oder wissen kann:
 * - er selbst, vollstaendig
 * - der Ort, an dem er steht (er sieht, was dort liegt und wohin es weitergeht)
 * - wer neben ihm steht, mit Namen — mehr nicht
 * - seine eigenen Ueberzeugungen, mit der Sicherheit, die heute gilt
 *
 * Nicht drin: fremde Beduerfnisse, Vorraete, Persoenlichkeiten, fremdes Wissen,
 * das `infoRegistry`, die Bestaende anderer Orte. `agentViewIsolation.test.ts`
 * prueft das an der Serialisierung, nicht am Vorsatz.
 */

import { getAgent, getLocation, occupantsOf } from '../core/access.js';
import type {
  Agent,
  AgentId,
  InfoId,
  KnowledgeEntry,
  Location,
  LocationId,
  MatchConfig,
  Personality,
  Round,
  Score01,
  WorldState,
} from '../core/types.js';
import { effectiveCertainty } from '../information/knowledge.js';

/** Was ein Agent von einem anderen sieht, wenn beide am selben Ort stehen. */
export interface PublicAgent {
  id: AgentId;
  name: string;
}

/** Was ein Agent von seinem eigenen Ort sieht. */
export interface VisibleLocation {
  id: LocationId;
  name: string;
  neighbors: LocationId[];
  stock: Location['stock'];
  isPublic: boolean;
}

/** Eigene Ueberzeugung plus die Sicherheit, die in dieser Runde tatsaechlich gilt. */
export interface BeliefView {
  entry: KnowledgeEntry;
  /** nach Verfall (Doc 03 §3.4.2) */
  certainty: Score01;
  /** darf als Tatsache behauptet werden (Doc 08 §8.2.2 R2/R6) — ab T13 relevant */
  assertable: boolean;
}

export interface AgentView {
  round: Round;
  self: {
    id: AgentId;
    name: string;
    personality: Readonly<Personality>;
    needs: Agent['needs'];
    resources: Agent['resources'];
    status: Agent['status'];
    cooldowns: Agent['cooldowns'];
    allianceId: Agent['allianceId'];
  };
  here: VisibleLocation;
  /** Anwesende ausser einem selbst, nach Id sortiert. */
  coLocated: PublicAgent[];
  beliefs: Record<InfoId, BeliefView>;
  /** Nur die Abschnitte, die eine Entscheidung braucht — nie der ganze Match-Zustand. */
  economy: Readonly<MatchConfig['economy']>;
}

export function buildAgentView(state: Readonly<WorldState>, agentId: AgentId): AgentView {
  const agent = getAgent(state, agentId);
  const location = getLocation(state, agent.location);
  const config = state.config;

  const beliefs: Record<InfoId, BeliefView> = {};
  for (const infoId of Object.keys(agent.knowledge).sort() as InfoId[]) {
    const entry = agent.knowledge[infoId];
    if (!entry) continue;
    const item = state.infoRegistry[infoId];
    if (!item) continue;

    const certainty = effectiveCertainty(entry, item, state.round, config.info);
    beliefs[infoId] = {
      entry: { ...entry, sharedWith: [...entry.sharedWith] },
      certainty,
      assertable:
        (entry.source === 'observed' || entry.source === 'participated') &&
        certainty >= config.info.assertCertaintyThreshold,
    };
  }

  return {
    round: state.round,
    self: {
      id: agent.id,
      name: agent.name,
      personality: { ...agent.personality },
      needs: { ...agent.needs },
      resources: { ...agent.resources },
      status: { ...agent.status, exiledFrom: [...agent.status.exiledFrom] },
      cooldowns: { ...agent.cooldowns },
      allianceId: agent.allianceId,
    },
    here: {
      id: location.id,
      name: location.name,
      neighbors: [...location.neighbors],
      stock: { ...location.stock },
      isPublic: location.isPublic,
    },
    coLocated: occupantsOf(state, agent.location)
      .filter((other) => other.id !== agent.id)
      .map((other) => ({ id: other.id, name: other.name })),
    beliefs,
    economy: { ...config.economy },
  };
}

/**
 * Was ein Agent ueber den Bestand an einem Ort glaubt — oder nichts.
 *
 * Fuer den eigenen Ort ist das keine Ueberzeugung, sondern Anschauung: er steht
 * daneben. Fuer jeden anderen Ort zaehlt nur, was er sich gemerkt hat, und wie
 * sicher er sich da heute noch ist.
 */
export function believedStock(
  view: Readonly<AgentView>,
  locationId: LocationId,
  kind: keyof VisibleLocation['stock'],
  infoIdFor: (locationId: LocationId, kind: keyof VisibleLocation['stock']) => InfoId,
): { value: number; certainty: Score01 } | null {
  if (locationId === view.here.id) {
    return { value: view.here.stock[kind], certainty: 1 };
  }

  const belief = view.beliefs[infoIdFor(locationId, kind)];
  if (!belief || typeof belief.entry.believedValue !== 'number') return null;
  return { value: belief.entry.believedValue, certainty: belief.certainty };
}
