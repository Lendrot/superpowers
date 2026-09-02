/**
 * T04 — Append-only Event-Log mit stabilem Log-Hash.
 *
 * Der Log-Hash ist das Gate des gesamten Projekts (Doc 12, Tag 1): aendert sich
 * das Verhalten der Engine unbeabsichtigt, aendert sich dieser Hash. Er wird
 * rollend fortgeschrieben, damit Anhaengen O(1) bleibt und der Hash die
 * *Reihenfolge* mit erfasst — zwei vertauschte Events sind ein anderer Lauf.
 */

import { RollingHash, canonicalJson } from './hash.js';
import { eventId } from './ids.js';
import type { EventType, MatchId, Round, WorldEvent } from './types.js';

/** Alles ausser `id` und `seq` — die vergibt der Log. */
export type EventDraft = Omit<WorldEvent, 'id' | 'seq' | 'matchId'>;

export interface EventLog {
  readonly matchId: MatchId;
  readonly size: number;
  /** Rollender Hash ueber alle bisher angehaengten Events. */
  readonly hash: string;
  readonly events: readonly WorldEvent[];
  /** Naechste Sequenznummer — fortlaufend ueber das ganze Match. */
  readonly nextSeq: number;
  append(draft: EventDraft): WorldEvent;
  byRound(round: Round): WorldEvent[];
  countByType(): Record<string, number>;
}

class AppendOnlyLog implements EventLog {
  private readonly entries: WorldEvent[] = [];
  private readonly rolling = new RollingHash();

  constructor(readonly matchId: MatchId) {
    // Der Hash startet an der MatchId: zwei Laeufe mit unterschiedlichem Seed
    // duerfen nie zufaellig denselben Log-Hash tragen, auch wenn ihre Events
    // gleich aussehen.
    this.rolling.update(`match:${matchId}\n`);
  }

  get size(): number {
    return this.entries.length;
  }

  get hash(): string {
    return this.rolling.digest();
  }

  get events(): readonly WorldEvent[] {
    return this.entries;
  }

  get nextSeq(): number {
    return this.entries.length;
  }

  append(draft: EventDraft): WorldEvent {
    const seq = this.entries.length;
    const event: WorldEvent = {
      ...draft,
      id: eventId(draft.round, seq),
      matchId: this.matchId,
      seq,
    };
    this.entries.push(event);
    this.rolling.update(canonicalJson(event)).update('\n');
    return event;
  }

  byRound(round: Round): WorldEvent[] {
    return this.entries.filter((event) => event.round === round);
  }

  countByType(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const event of this.entries) {
      counts[event.type] = (counts[event.type] ?? 0) + 1;
    }
    return counts;
  }
}

export function createEventLog(matchId: MatchId): EventLog {
  return new AppendOnlyLog(matchId);
}

/**
 * Hash einer fertigen Event-Folge — fuer Replays und fuer den Vergleich zweier
 * Laeufe, ohne beide Logs vollstaendig im Speicher halten zu muessen.
 */
export function hashEvents(matchId: MatchId, events: readonly WorldEvent[]): string {
  const rolling = new RollingHash().update(`match:${matchId}\n`);
  for (const event of events) {
    rolling.update(canonicalJson(event)).update('\n');
  }
  return rolling.digest();
}

export function isEventType(value: string): value is EventType {
  return (
    value === 'match_started' ||
    value === 'round_started' ||
    value === 'agent_rested' ||
    value === 'resource_gathered' ||
    value === 'gather_failed' ||
    value === 'action_rejected' ||
    value === 'round_ended' ||
    value === 'match_ended'
  );
}
