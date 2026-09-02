/**
 * Deterministische ID-Vergabe.
 *
 * IDs sind sortierbar, weil die Aufloesungsreihenfolge bei Gleichstand nach
 * `agentId asc` bricht (Doc 04 §4.3). Nichts hier darf von Zeit, Zufall oder
 * Einfuegereihenfolge abhaengen.
 */

import { hashValue } from './hash.js';
import type { AgentId, EventId, MatchId, Round } from './types.js';

export function agentId(index: number): AgentId {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`agentId: Index muss >= 0 und ganzzahlig sein, war ${index}`);
  }
  return `agent_${String(index).padStart(3, '0')}`;
}

/** Index zurueck aus einer von `agentId` erzeugten ID (fuer Tests und Reports). */
export function agentIndex(id: AgentId): number {
  const raw = id.slice('agent_'.length);
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new TypeError(`agentIndex: unerwartete AgentId ${id}`);
  }
  return parsed;
}

export function eventId(round: Round, seq: number): EventId {
  return `event_${String(round).padStart(4, '0')}_${String(seq).padStart(5, '0')}`;
}

/**
 * Die MatchId haengt nur am Seed und an der Konfiguration — zwei Laeufe mit
 * gleichem Seed und gleicher Config heissen gleich, und die ID kann deshalb im
 * Event-Log stehen, ohne den Determinismus zu brechen.
 */
export function matchId(seed: number, config: unknown): MatchId {
  return `match_${seed}_${hashValue(config).slice(0, 8)}`;
}
