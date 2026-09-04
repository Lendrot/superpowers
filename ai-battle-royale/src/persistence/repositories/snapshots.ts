/**
 * T27 — `snapshots`: ein vollstaendiger `WorldState` je Zeile, mit dem
 * *live* RNG-Zaehlerstand eingebettet statt dem Stand aus `initWorld`.
 *
 * `state.rngState` wird waehrend einer Runde absichtlich nicht vom
 * StateMutator nachgefuehrt (`core/types.ts`, Kommentar an `RngStateBundle`)
 * — es bleibt ausserhalb seiner Zustaendigkeit. Der Snapshot ist die Stelle,
 * an der der aktuelle `rng.snapshot()`-Stand in den serialisierten State
 * eingemischt wird; ohne das waere jedes Resume auf die Zufallsfolge ab
 * Rundenbeginn der Startwelt zurueckgesetzt, nicht ab dem Snapshot.
 */

import type Database from 'better-sqlite3';

import { canonicalJson, hashString } from '../../engine/index.js';
import type { MatchId, RngStateBundle, WorldState } from '../../engine/index.js';

export function saveSnapshot(
  db: Database.Database,
  matchId: MatchId,
  round: number,
  state: Readonly<WorldState>,
  rngState: RngStateBundle,
): void {
  const toStore: WorldState = { ...state, rngState };
  const json = canonicalJson(toStore);
  db.prepare(
    `INSERT INTO snapshots (match_id, round, state_json, state_hash) VALUES (@matchId, @round, @json, @hash)
     ON CONFLICT (match_id, round) DO UPDATE SET state_json = excluded.state_json, state_hash = excluded.state_hash`,
  ).run({ matchId, round, json, hash: hashString(json) });
}

export interface LoadedSnapshot {
  round: number;
  state: WorldState;
}

export function loadLatestSnapshot(db: Database.Database, matchId: MatchId): LoadedSnapshot | undefined {
  const row = db
    .prepare(`SELECT round, state_json, state_hash FROM snapshots WHERE match_id = ? ORDER BY round DESC LIMIT 1`)
    .get(matchId) as { round: number; state_json: string; state_hash: string } | undefined;
  if (!row) return undefined;
  return parseRow(row);
}

export function loadSnapshot(db: Database.Database, matchId: MatchId, round: number): LoadedSnapshot | undefined {
  const row = db
    .prepare(`SELECT round, state_json, state_hash FROM snapshots WHERE match_id = ? AND round = ?`)
    .get(matchId, round) as { round: number; state_json: string; state_hash: string } | undefined;
  if (!row) return undefined;
  return parseRow(row);
}

function parseRow(row: { round: number; state_json: string; state_hash: string }): LoadedSnapshot {
  if (hashString(row.state_json) !== row.state_hash) {
    throw new Error(`Snapshot fuer Runde ${row.round} ist beschaedigt: state_hash passt nicht zum Inhalt`);
  }
  return { round: row.round, state: JSON.parse(row.state_json) as WorldState };
}
