/**
 * T27 — Persistierter Match-Lauf: derselbe Phasenablauf wie
 * `engine/runner/runMatch.ts`, aber mit periodischen Snapshots und einem
 * fortlaufend nach SQLite geschriebenen Event-Log, damit ein unterbrochener
 * Lauf fortgesetzt werden kann (`resumeMatch`).
 *
 * `runMatch.ts` selbst bleibt unveraendert und bewusst nicht resumable — es
 * ist die einfache, rein speicherbasierte Variante fuer Tests und den
 * Long-Run-Harness (T26), wo eine SQLite-Datei pro Match nur Kosten ohne
 * Nutzen waere. Diese Datei ist die zweite, resumable Variante desselben
 * Phasenablaufs (`runRound`, unveraendert), fuer echte Unterbrechungen.
 *
 * Snapshot-Kadenz: alle `snapshotInterval` Runden (Default 25, Doc 02 §2.5
 * "alle 25 Runden + Ende") plus immer am Ende dieses Aufrufs — beim Fortsetzen
 * eines bereits beendeten Matches ist das ein Neu-Schreiben desselben Standes
 * (`ON CONFLICT` in `repositories/snapshots.ts`), kein Fehler.
 */

import type Database from 'better-sqlite3';

import {
  createEventLog,
  createRngBundle,
  emptyRejectCounts,
  hashEvents,
  initWorld,
  leaderboard,
  policyProvider,
  runRound,
  totalRejects,
} from '../engine/index.js';
import type {
  DecisionProvider,
  EventLog,
  MatchConfig,
  MatchId,
  RejectCounts,
  RngBundle,
  ScoreEntry,
  WorldState,
} from '../engine/index.js';

import { insertMatch, updateMatchStatus } from './repositories/matches.js';
import { appendEvents, loadEventDrafts } from './repositories/eventLog.js';
import { saveSnapshot, loadLatestSnapshot } from './repositories/snapshots.js';

export interface PersistOptions {
  provider?: DecisionProvider;
  maxRounds?: number;
  snapshotInterval?: number;
  mode?: string;
}

export interface PersistedMatchResult {
  matchId: MatchId;
  state: WorldState;
  logHash: string;
  /** Runden, die DIESER Aufruf gefahren hat — bei `resumeMatch` nicht die Gesamtzahl seit Rundenbeginn, siehe `state.round`. */
  rounds: number;
  events: number;
  decisions: number;
  rejects: RejectCounts;
  rejectRate: number;
  actionCounts: Record<string, number>;
  leaderboard: ScoreEntry[];
  endReason: WorldState['endReason'];
}

const DEFAULT_SNAPSHOT_INTERVAL = 25;

export function runPersistedMatch(
  db: Database.Database,
  config: MatchConfig,
  options: PersistOptions = {},
): PersistedMatchResult {
  if (config.llmMode !== 'off') {
    throw new Error(`llmMode '${config.llmMode}' ist noch nicht implementiert. Nur 'off' laeuft.`);
  }

  const { state, rng } = initWorld(config);
  const log = createEventLog(state.matchId);

  // Dasselbe einmalige Event wie `runner/runMatch.ts` — sonst weicht die
  // Event-Folge (und damit `logHash`) schon am allerersten Eintrag ab.
  log.append({
    round: state.round,
    type: 'match_started',
    locationId: null,
    payload: { seed: config.seed, agentCount: config.agentCount, maxRounds: config.maxRounds },
    visibility: { scope: 'public' },
    infoRefs: [],
  });

  insertMatch(db, {
    id: state.matchId,
    seed: config.seed,
    config,
    startedAt: new Date().toISOString(),
    status: 'running',
    mode: options.mode ?? 'headless',
  });

  return drive(
    db,
    { state, rng, log, provider: options.provider ?? policyProvider },
    {
      maxRounds: options.maxRounds ?? config.maxRounds,
      snapshotInterval: options.snapshotInterval ?? DEFAULT_SNAPSHOT_INTERVAL,
      alreadyPersisted: 0,
    },
  );
}

/**
 * Laedt den juengsten Snapshot eines Matches, baut daraus WorldState und
 * RNG-Bundle wieder auf, spielt das bereits persistierte Event-Log erneut in
 * ein frisches `EventLog` ein (rekonstruiert dieselben `id`s/denselben
 * Rollhash-Stand wie im Originallauf, siehe `repositories/eventLog.ts`) und
 * faehrt dann mit `runRound` fort, bis das Match endet oder `maxRounds`
 * erreicht ist.
 */
export function resumeMatch(db: Database.Database, matchId: MatchId, options: PersistOptions = {}): PersistedMatchResult {
  const snapshot = loadLatestSnapshot(db, matchId);
  if (!snapshot) {
    throw new Error(`resumeMatch: kein Snapshot fuer ${matchId} vorhanden`);
  }
  const { state } = snapshot;
  const rng = createRngBundle(state.seed, state.rngState);

  const log = createEventLog(state.matchId);
  const drafts = loadEventDrafts(db, matchId);
  for (const draft of drafts) log.append(draft);

  return drive(
    db,
    { state, rng, log, provider: options.provider ?? policyProvider },
    {
      maxRounds: options.maxRounds ?? state.config.maxRounds,
      snapshotInterval: options.snapshotInterval ?? DEFAULT_SNAPSHOT_INTERVAL,
      alreadyPersisted: drafts.length,
    },
  );
}

interface DriveInput {
  state: WorldState;
  rng: RngBundle;
  log: EventLog;
  provider: DecisionProvider;
}

interface DriveOptions {
  maxRounds: number;
  snapshotInterval: number;
  /** Wieviele Events beim Start dieses Aufrufs schon in `event_log` stehen — ab hier wird geflusht. */
  alreadyPersisted: number;
}

function drive(db: Database.Database, input: DriveInput, opts: DriveOptions): PersistedMatchResult {
  const { state, rng, log, provider } = input;
  let persisted = opts.alreadyPersisted;
  const rejects = emptyRejectCounts();
  const actionCounts: Record<string, number> = {};
  let decisions = 0;
  let rounds = 0;

  const flush = (withSnapshot: boolean): void => {
    if (log.events.length > persisted) {
      appendEvents(db, state.matchId, log.events.slice(persisted));
      persisted = log.events.length;
    }
    if (withSnapshot) {
      saveSnapshot(db, state.matchId, state.round, state, rng.snapshot());
    }
  };

  while (state.status === 'running' && rounds < opts.maxRounds) {
    const result = runRound(state, { rng, log, provider });
    rounds += 1;
    decisions += result.decisions;
    for (const [reason, count] of Object.entries(result.rejects)) {
      rejects[reason as keyof RejectCounts] += count;
    }
    for (const [type, count] of Object.entries(result.actionCounts)) {
      actionCounts[type] = (actionCounts[type] ?? 0) + count;
    }

    flush(state.round % opts.snapshotInterval === 0 || state.status !== 'running');
  }
  flush(true);

  updateMatchStatus(db, state.matchId, {
    status: state.status,
    endedAt: state.status === 'finished' ? new Date().toISOString() : null,
  });

  return {
    matchId: state.matchId,
    state,
    logHash: hashEvents(state.matchId, log.events),
    rounds,
    events: log.size,
    decisions,
    rejects,
    rejectRate: decisions === 0 ? 0 : totalRejects(rejects) / decisions,
    actionCounts,
    leaderboard: leaderboard(state),
    endReason: state.endReason,
  };
}
