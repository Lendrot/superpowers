/**
 * T27 — `event_log`: anhaengen und fuer ein Resume wieder als `EventDraft[]`
 * laden (Reihenfolge nach `seq`, damit `EventLog.append` beim Wiederabspielen
 * dieselben `id`s/denselben Hash rekonstruiert wie der urspruengliche Lauf —
 * `id` ist eine reine Funktion von `(round, seq)`, siehe `core/ids.ts#eventId`).
 */

import type Database from 'better-sqlite3';

import { canonicalJson } from '../../engine/index.js';
import type {
  AgentId,
  AllianceId,
  EventDraft,
  EventType,
  InfoId,
  JsonValue,
  LocationId,
  MatchId,
  Visibility,
  WorldEvent,
} from '../../engine/index.js';

export function appendEvents(db: Database.Database, matchId: MatchId, events: readonly WorldEvent[]): void {
  if (events.length === 0) return;
  const insert = db.prepare(
    `INSERT INTO event_log
       (match_id, round, seq, type, actor_id, target_id, alliance_id, location_id, payload_json, visibility_json, info_refs_json)
     VALUES
       (@matchId, @round, @seq, @type, @actorId, @targetId, @allianceId, @locationId, @payloadJson, @visibilityJson, @infoRefsJson)`,
  );
  const insertAll = db.transaction((rows: readonly WorldEvent[]) => {
    for (const event of rows) {
      insert.run({
        matchId,
        round: event.round,
        seq: event.seq,
        type: event.type,
        actorId: event.actorId ?? null,
        targetId: event.targetId ?? null,
        allianceId: event.allianceId ?? null,
        locationId: event.locationId,
        payloadJson: canonicalJson(event.payload),
        visibilityJson: canonicalJson(event.visibility),
        infoRefsJson: canonicalJson(event.infoRefs),
      });
    }
  });
  insertAll(events);
}

interface EventLogRow {
  round: number;
  seq: number;
  type: string;
  actor_id: string | null;
  target_id: string | null;
  alliance_id: string | null;
  location_id: string | null;
  payload_json: string;
  visibility_json: string;
  info_refs_json: string;
}

export function loadEventDrafts(db: Database.Database, matchId: MatchId): EventDraft[] {
  const rows = db
    .prepare(`SELECT * FROM event_log WHERE match_id = ? ORDER BY seq ASC`)
    .all(matchId) as EventLogRow[];
  return rows.map(toDraft);
}

export function countEvents(db: Database.Database, matchId: MatchId): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM event_log WHERE match_id = ?`).get(matchId) as { n: number };
  return row.n;
}

function toDraft(row: EventLogRow): EventDraft {
  return {
    round: row.round,
    type: row.type as EventType,
    actorId: (row.actor_id ?? undefined) as AgentId | undefined,
    targetId: (row.target_id ?? undefined) as AgentId | undefined,
    allianceId: (row.alliance_id ?? undefined) as AllianceId | undefined,
    locationId: row.location_id as LocationId | null,
    payload: JSON.parse(row.payload_json) as Record<string, JsonValue>,
    visibility: JSON.parse(row.visibility_json) as Visibility,
    infoRefs: JSON.parse(row.info_refs_json) as InfoId[],
  };
}
