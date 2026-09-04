/**
 * T27 — Oeffentliche Persistenz-API. Ausserhalb der Engine (Doc 09 §9.1):
 * importiert `better-sqlite3`, was `src/engine/**` per ESLint-Boundary nie
 * darf.
 */

export { openDatabase } from './db.js';
export { runPersistedMatch, resumeMatch } from './persistMatch.js';
export type { PersistOptions, PersistedMatchResult } from './persistMatch.js';

export { getMatch, insertMatch, updateMatchStatus } from './repositories/matches.js';
export type { MatchRow } from './repositories/matches.js';
export { appendEvents, countEvents, loadEventDrafts } from './repositories/eventLog.js';
export { loadLatestSnapshot, loadSnapshot, saveSnapshot } from './repositories/snapshots.js';
export type { LoadedSnapshot } from './repositories/snapshots.js';
