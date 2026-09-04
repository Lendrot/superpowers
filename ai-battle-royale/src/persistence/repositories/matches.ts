/**
 * T27 — CRUD fuer `matches` (Doc 02 §2.5).
 */

import type Database from 'better-sqlite3';

import { canonicalJson } from '../../engine/index.js';
import type { MatchConfig, MatchId } from '../../engine/index.js';

export interface MatchRow {
  id: MatchId;
  seed: number;
  config: MatchConfig;
  startedAt: string;
  endedAt: string | null;
  status: 'running' | 'finished';
  mode: string;
}

interface RawMatchRow {
  id: string;
  seed: number;
  config_json: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  mode: string;
}

export function insertMatch(
  db: Database.Database,
  row: { id: MatchId; seed: number; config: MatchConfig; startedAt: string; status: 'running' | 'finished'; mode: string },
): void {
  db.prepare(
    `INSERT INTO matches (id, seed, config_json, started_at, ended_at, status, mode)
     VALUES (@id, @seed, @configJson, @startedAt, NULL, @status, @mode)`,
  ).run({
    id: row.id,
    seed: row.seed,
    configJson: canonicalJson(row.config),
    startedAt: row.startedAt,
    status: row.status,
    mode: row.mode,
  });
}

export function updateMatchStatus(
  db: Database.Database,
  id: MatchId,
  patch: { status: 'running' | 'finished'; endedAt: string | null },
): void {
  db.prepare(`UPDATE matches SET status = @status, ended_at = @endedAt WHERE id = @id`).run({
    id,
    status: patch.status,
    endedAt: patch.endedAt,
  });
}

export function getMatch(db: Database.Database, id: MatchId): MatchRow | undefined {
  const row = db.prepare(`SELECT * FROM matches WHERE id = ?`).get(id) as RawMatchRow | undefined;
  if (!row) return undefined;
  return {
    id: row.id as MatchId,
    seed: row.seed,
    config: JSON.parse(row.config_json) as MatchConfig,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status as 'running' | 'finished',
    mode: row.mode,
  };
}
