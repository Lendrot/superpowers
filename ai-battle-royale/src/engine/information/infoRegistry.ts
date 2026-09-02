/**
 * T10 — InfoRegistry: welche Tatsachen es in dieser Welt ueberhaupt gibt.
 *
 * Vier getrennte Ebenen, verbindlich (Doc 03 §3.4.2):
 *   1. Die Weltwahrheit  — hier, ueber `resolveTrueValue`
 *   2. `KnowledgeEntry`  — was ein Agent glaubt (kann veraltet sein)
 *   3. `certainty`       — wie sicher er sich ist
 *   4. `Statement`       — was er davon nach aussen sagt (T12)
 *
 * `resolveTrueValue` ist die einzige Funktion, die Ebene 1 liest. Sie wird
 * ausschliesslich von Phase 2 (Perception) aufgerufen. Kein Entscheidungspfad
 * hat Zugriff darauf — die Signatur verlangt den vollen `WorldState`, den eine
 * Policy per `AgentView` gar nicht bekommt.
 */

import { attributeValue } from '../agents/attributes.js';
import { ATTRIBUTE_TRACKS } from '../core/types.js';
import type {
  AgentId,
  AttributeTrack,
  InfoId,
  InfoItem,
  InfoValue,
  LocationId,
  ResourceKind,
  Round,
  WorldState,
} from '../core/types.js';

// ── IDs ──────────────────────────────────────────────────────────────────────

export function stockInfoId(locationId: LocationId, kind: ResourceKind): InfoId {
  return `info_stock_${locationId}_${kind}`;
}

export function agentResourceInfoId(agentId: AgentId, kind: ResourceKind): InfoId {
  return `info_res_${agentId}_${kind}`;
}

export function attributeInfoId(agentId: AgentId, track: AttributeTrack): InfoId {
  return `info_attr_${agentId}_${track}`;
}

export function eventInfoId(eventKey: string): InfoId {
  return `info_event_${eventKey}`;
}

// ── Registry ─────────────────────────────────────────────────────────────────

export function stockInfoItem(locationId: LocationId, kind: ResourceKind, round: Round): InfoItem {
  return {
    id: stockInfoId(locationId, kind),
    topic: 'stock_at_location',
    subject: { kind: 'location', ref: locationId },
    valueType: 'quantity',
    createdRound: round,
    // Bestaende aendern sich jede Runde: wer nicht hinsieht, weiss es bald nicht mehr.
    volatility: 'fast',
  };
}

export function agentResourceInfoItem(agentId: AgentId, kind: ResourceKind, round: Round): InfoItem {
  return {
    id: agentResourceInfoId(agentId, kind),
    topic: 'agent_resource',
    subject: { kind: 'agent', ref: agentId },
    valueType: 'quantity',
    createdRound: round,
    volatility: 'fast',
  };
}

export function attributeInfoItem(agentId: AgentId, track: AttributeTrack, round: Round): InfoItem {
  return {
    id: attributeInfoId(agentId, track),
    topic: 'agent_attribute',
    subject: { kind: 'agent', ref: agentId },
    valueType: 'quantity',
    createdRound: round,
    // Faehigkeiten aendern sich langsam: wer jemanden vor zehn Runden kaempfen
    // sah, hat immer noch ein brauchbares Bild von dessen Kraft.
    volatility: 'slow',
  };
}

export function eventInfoItem(eventKey: string, round: Round): InfoItem {
  return {
    id: eventInfoId(eventKey),
    topic: 'event_occurred',
    subject: { kind: 'world', ref: eventKey },
    valueType: 'event_ref',
    createdRound: round,
    // Ein Ereignis, das stattgefunden hat, hoert nicht wieder auf stattgefunden
    // zu haben. Wissen darueber veraltet nicht.
    volatility: 'static',
  };
}

// ── Weltwahrheit ─────────────────────────────────────────────────────────────

/**
 * Der tatsaechliche Wert einer Info im aktuellen Weltzustand.
 *
 * NUR fuer Phase 2 (Perception). Wer das an anderer Stelle aufruft, gibt einem
 * Agenten Wissen, das er nicht erworben hat — der Fehler, den Doc 13 §4 als den
 * haeufigsten dieser Systeme benennt.
 */
export function resolveTrueValue(state: Readonly<WorldState>, infoId: InfoId): InfoValue | undefined {
  const item = state.infoRegistry[infoId];
  if (!item) return undefined;

  switch (item.topic) {
    case 'stock_at_location': {
      const location = state.locations[item.subject.ref as LocationId];
      if (!location) return undefined;
      const kind = kindFromInfoId(infoId);
      return kind ? location.stock[kind] : undefined;
    }
    case 'agent_resource': {
      const agent = state.agents[item.subject.ref as AgentId];
      if (!agent) return undefined;
      const kind = kindFromInfoId(infoId);
      return kind ? agent.resources[kind] : undefined;
    }
    case 'agent_attribute': {
      const agent = state.agents[item.subject.ref as AgentId];
      if (!agent) return undefined;
      const track = trackFromInfoId(infoId);
      return track ? attributeValue(agent.experience[track], state.config.attributes) : undefined;
    }
    case 'event_occurred':
      // Das Ereignis ist eingetreten — mehr sagt diese Info nicht aus.
      return true;
    case 'agent_alliance':
    case 'agent_secret_goal':
    case 'pledge_state':
    case 'agent_intent_declared':
      // Diese Themen existieren als Typ, aber die Systeme dahinter noch nicht
      // (T20, T21). Bis dahin gibt es dazu keine Wahrheit aufzuloesen.
      return undefined;
  }
}

const KIND_SUFFIXES: readonly ResourceKind[] = ['food', 'coins', 'materials'];

function kindFromInfoId(infoId: InfoId): ResourceKind | undefined {
  return KIND_SUFFIXES.find((kind) => infoId.endsWith(`_${kind}`));
}

function trackFromInfoId(infoId: InfoId): AttributeTrack | undefined {
  return ATTRIBUTE_TRACKS.find((track) => infoId.endsWith(`_${track}`));
}
