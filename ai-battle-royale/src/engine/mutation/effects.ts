/**
 * Effect-Konstruktoren und -Auswertung.
 *
 * Effects sind Daten, keine Befehle: sie werden von reinen Aktionen erzeugt,
 * koennen geprueft, protokolliert und verworfen werden, und erst der
 * StateMutator wendet sie an (CLAUDE.md Regel 1).
 */

import { RESOURCE_KINDS, emptyResources } from '../core/resources.js';
import type {
  ActionType,
  AgentId,
  Effect,
  EliminationCause,
  EndReason,
  EventType,
  Experience,
  InfoItem,
  KnowledgeEntry,
  LocationId,
  Needs,
  Personality,
  RelationshipStats,
  Resources,
  Round,
  StatementRecord,
  StockChangeReason,
} from '../core/types.js';

export const effect = {
  resource(agentId: AgentId, delta: Partial<Resources>): Effect {
    return { t: 'resource', agentId, delta };
  },
  locationStock(locationId: LocationId, delta: Partial<Resources>, reason: StockChangeReason): Effect {
    return { t: 'location_stock', locationId, delta, reason };
  },
  need(agentId: AgentId, delta: Partial<Needs>): Effect {
    return { t: 'need', agentId, delta };
  },
  status(agentId: AgentId, patch: { hungerStreak?: number; exhaustionStreak?: number }): Effect {
    return { t: 'status', agentId, patch };
  },
  move(agentId: AgentId, to: LocationId): Effect {
    return { t: 'move', agentId, to };
  },
  eliminate(agentId: AgentId, cause: EliminationCause, killedBy?: AgentId): Effect {
    return killedBy ? { t: 'eliminate', agentId, cause, killedBy } : { t: 'eliminate', agentId, cause };
  },
  experience(agentId: AgentId, delta: Partial<Experience>): Effect {
    return { t: 'experience', agentId, delta };
  },
  personality(agentId: AgentId, delta: Partial<Personality>): Effect {
    return { t: 'personality', agentId, delta };
  },
  cooldown(agentId: AgentId, action: ActionType, readyAtRound: Round): Effect {
    return { t: 'cooldown', agentId, action, readyAtRound };
  },
  kill(agentId: AgentId): Effect {
    return { t: 'kill', agentId };
  },
  relationship(
    from: AgentId,
    to: AgentId,
    delta: Partial<RelationshipStats>,
    eventType: EventType,
  ): Effect {
    return { t: 'relationship', from, to, delta, eventType };
  },
  statement(agentId: AgentId, record: StatementRecord): Effect {
    return { t: 'statement', agentId, record };
  },
  infoItem(item: InfoItem): Effect {
    return { t: 'info_item', item };
  },
  knowledge(agentId: AgentId, entry: KnowledgeEntry): Effect {
    return { t: 'knowledge', agentId, entry };
  },
  roundAdvance(): Effect {
    return { t: 'round_advance' };
  },
  matchEnd(reason: EndReason): Effect {
    return { t: 'match_end', reason };
  },
} as const;

/**
 * Erwartete Gesamtaenderung des Ressourcenbestands durch eine Effektliste.
 *
 * Der StateMutator vergleicht das mit der tatsaechlichen Aenderung. Weicht
 * beides ab, hat jemand am Mutator vorbeigeschrieben — genau der Fehler, den
 * Regel 1 verhindern soll und den ein Review erfahrungsgemaess nicht findet.
 */
export function expectedResourceDelta(effects: readonly Effect[]): Resources {
  const total = emptyResources();
  for (const item of effects) {
    if (item.t !== 'resource' && item.t !== 'location_stock') continue;
    for (const kind of RESOURCE_KINDS) {
      total[kind] += item.delta[kind] ?? 0;
    }
  }
  return total;
}

/** Nur zur Anzeige/Diagnose: Kurzform eines Effekts. */
export function describeEffect(item: Effect): string {
  switch (item.t) {
    case 'resource':
      return `resource ${item.agentId} ${JSON.stringify(item.delta)}`;
    case 'location_stock':
      return `stock ${item.locationId} ${JSON.stringify(item.delta)} (${item.reason})`;
    case 'need':
      return `need ${item.agentId} ${JSON.stringify(item.delta)}`;
    case 'status':
      return `status ${item.agentId} ${JSON.stringify(item.patch)}`;
    case 'move':
      return `move ${item.agentId} -> ${item.to}`;
    case 'eliminate':
      return `eliminate ${item.agentId} (${item.cause})`;
    case 'experience':
      return `experience ${item.agentId} ${JSON.stringify(item.delta)}`;
    case 'personality':
      return `personality ${item.agentId} ${JSON.stringify(item.delta)}`;
    case 'cooldown':
      return `cooldown ${item.agentId} ${item.action} -> ${item.readyAtRound}`;
    case 'kill':
      return `kill ${item.agentId}`;
    case 'relationship':
      return `relationship ${item.from} -> ${item.to} ${JSON.stringify(item.delta)} (${item.eventType})`;
    case 'statement':
      return `statement ${item.agentId} ${item.record.kind} ueber ${item.record.infoId}`;
    case 'info_item':
      return `info_item ${item.item.id}`;
    case 'knowledge':
      return `knowledge ${item.agentId} <- ${item.entry.infoId}`;
    case 'round_advance':
      return 'round_advance';
    case 'match_end':
      return `match_end (${item.reason})`;
  }
}
