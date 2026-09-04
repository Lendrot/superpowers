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
import { defaultRelationship } from '../core/relationship.js';
import type {
  Agent,
  AgentId,
  Attributes,
  Instincts,
  Stat,
  InfoId,
  KnowledgeEntry,
  Location,
  LocationId,
  MatchConfig,
  Personality,
  Relationship,
  Round,
  Score01,
  WorldState,
} from '../core/types.js';
import { effectiveCertainty } from '../information/knowledge.js';
import { attributeInfoId } from '../information/infoRegistry.js';
import { attributeValue, attributesOf, instinctsOf, powerOf } from './attributes.js';

/**
 * Was ein Agent von einem anderen sieht, wenn beide am selben Ort stehen.
 *
 * `believedStrength` ist ausdruecklich eine *Einschaetzung*, keine Tatsache:
 * sie stammt aus dem eigenen Wissen (wer den anderen kaempfen sah) und faellt
 * sonst auf den Startwert zurueck, den jeder kennt. Ein Agent, der einen
 * Fremden angreift, tut das auf Basis einer Annahme — und kann sich irren.
 */
export interface PublicAgent {
  id: AgentId;
  name: string;
  believedStrength: Stat;
  /** 0 = reine Annahme aus dem Startwert, 1 = gerade selbst gesehen */
  strengthCertainty: Score01;
  /**
   * Die eigene, gerichtete Sicht auf diesen Anderen (Doc 03 §3.3). Kein
   * Fremdwissen — es ist der eigene Eintrag `self.relationships[other.id]`,
   * nur unter einem anderen Namen serialisiert. Fehlt er, gilt der neutrale
   * Ausgangswert: man kennt sich noch nicht.
   */
  relationship: Readonly<Relationship>;
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

/**
 * Was jeder Agent ueber die Regeln der Welt weiss, ohne es beobachtet zu haben.
 *
 * Das ist kein Schlupfloch in der Epistemik: "alle starten gleich stark" ist
 * eine Eigenschaft der Welt, keine Beobachtung an einer bestimmten Person.
 * Wissen ueber *einzelne* Agenten entsteht weiterhin ausschliesslich in Phase 2.
 */
export interface WorldKnowledge {
  /** Faehigkeitswert, mit dem jeder Agent begonnen hat. */
  startingAttribute: Stat;
}

export interface AgentView {
  round: Round;
  world: WorldKnowledge;
  self: {
    id: AgentId;
    name: string;
    personality: Readonly<Personality>;
    /** erworbenes Koennen — entwickelt sich ueber das Match */
    attributes: Attributes;
    /** was daraus folgt: Ueberlebensinstinkt, Machtinstinkt, Glueck */
    instincts: Instincts;
    /** abgeleitete Kennzahl, kein Bestand (Doc 03 §3.2.2) */
    power: Score01;
    kills: number;
    needs: Agent['needs'];
    resources: Agent['resources'];
    status: Agent['status'];
    cooldowns: Agent['cooldowns'];
    allianceId: Agent['allianceId'];
    /**
     * T24: die eigenen, aus der eigenen `episodic` gelernten Lessons — kein
     * Fremdwissen, jede stammt aus einer Episode, die dieser Agent selbst im
     * Beobachterset hatte (Doc 03 §6.2).
     */
    lessons: Agent['lessons'];
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

  const attributes = attributesOf(agent, config.attributes);
  const startingAttribute = attributeValue(config.attributes.startExperience, config.attributes);

  return {
    round: state.round,
    world: { startingAttribute },
    self: {
      id: agent.id,
      name: agent.name,
      personality: { ...agent.personality },
      attributes,
      instincts: instinctsOf(attributes),
      power: powerOf(agent, config.attributes),
      kills: agent.kills,
      needs: { ...agent.needs },
      resources: { ...agent.resources },
      status: { ...agent.status, exiledFrom: [...agent.status.exiledFrom] },
      cooldowns: { ...agent.cooldowns },
      allianceId: agent.allianceId,
      lessons: Object.fromEntries(
        Object.entries(agent.lessons).map(([key, lesson]) => [key, { ...lesson, supportingEpisodeIds: [...lesson.supportingEpisodeIds] }]),
      ),
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
      .map((other) => {
        const belief = beliefs[attributeInfoId(other.id, 'strength')];
        const believed = belief && typeof belief.entry.believedValue === 'number'
          ? belief.entry.believedValue
          : null;
        const relationship = agent.relationships[other.id] ?? defaultRelationship();
        return {
          id: other.id,
          name: other.name,
          // Ohne eigenes Wissen bleibt nur, was jeder weiss: am Anfang waren
          // alle gleich stark.
          believedStrength: believed ?? startingAttribute,
          strengthCertainty: believed === null ? 0 : belief!.certainty,
          relationship: { ...relationship, lastEventTypes: [...relationship.lastEventTypes] },
        };
      }),
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
