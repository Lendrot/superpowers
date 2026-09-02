/**
 * Ein vollstaendiges Match: Welt erzeugen, Runden fahren, Log-Hash liefern.
 *
 * Der Rueckgabewert ist alles, was ein Long-Run-Batch braucht, ohne den
 * WorldState zu kennen — und er ist bewusst klein: der Report von T26 waechst
 * hier an, nicht in der CLI.
 */

import { createEventLog } from '../core/eventLog.js';
import type { EventLog } from '../core/eventLog.js';
import type { MatchConfig, WorldState } from '../core/types.js';
import { policyProvider } from '../decision/policyProvider.js';
import type { DecisionProvider } from '../decision/provider.js';
import { initWorld } from '../world/initWorld.js';
import { leaderboard } from '../world/scoring.js';
import type { ScoreEntry } from '../world/scoring.js';
import { totalRejects } from '../validation/rejectReasons.js';
import type { RejectCounts } from '../validation/rejectReasons.js';
import { emptyRejectCounts } from '../validation/rejectReasons.js';
import { runRound } from './runRound.js';

export interface MatchResult {
  state: WorldState;
  log: EventLog;
  logHash: string;
  rounds: number;
  events: number;
  decisions: number;
  rejects: RejectCounts;
  rejectRate: number;
  actionCounts: Record<string, number>;
  eventCounts: Record<string, number>;
  leaderboard: ScoreEntry[];
  endReason: WorldState['endReason'];
}

export interface RunMatchOptions {
  /** Default: die deterministische Utility-Policy. Tests setzen hier eigene Provider ein. */
  provider?: DecisionProvider;
  /** Frueher Abbruch, z. B. fuer Teillaeufe in Tests. */
  maxRounds?: number;
}

export function runMatch(config: MatchConfig, options: RunMatchOptions = {}): MatchResult {
  if (config.llmMode !== 'off') {
    // Doc 07: mit `live` ist Determinismus prinzipiell unerreichbar, `mock`
    // braucht das Gateway aus T32. Beides gibt es noch nicht — und stillschweigend
    // deterministisch zu laufen, obwohl `live` angefordert wurde, waere die
    // schlechtere Antwort.
    throw new Error(`llmMode '${config.llmMode}' ist noch nicht implementiert (T32). Nur 'off' laeuft.`);
  }

  const { state, rng } = initWorld(config);
  const log = createEventLog(state.matchId);
  const provider = options.provider ?? policyProvider;

  log.append({
    round: state.round,
    type: 'match_started',
    locationId: null,
    payload: { seed: config.seed, agentCount: config.agentCount, maxRounds: config.maxRounds },
    visibility: { scope: 'public' },
    infoRefs: [],
  });

  const rejects = emptyRejectCounts();
  const actionCounts: Record<string, number> = {};
  let decisions = 0;
  let rounds = 0;

  const limit = options.maxRounds ?? config.maxRounds;
  while (state.status === 'running' && rounds < limit) {
    const result = runRound(state, { rng, log, provider });
    rounds += 1;
    decisions += result.decisions;

    for (const [reason, count] of Object.entries(result.rejects)) {
      rejects[reason as keyof RejectCounts] += count;
    }
    for (const [type, count] of Object.entries(result.actionCounts)) {
      actionCounts[type] = (actionCounts[type] ?? 0) + count;
    }
  }

  return {
    state,
    log,
    logHash: log.hash,
    rounds,
    events: log.size,
    decisions,
    rejects,
    rejectRate: decisions === 0 ? 0 : totalRejects(rejects) / decisions,
    actionCounts,
    eventCounts: log.countByType(),
    leaderboard: leaderboard(state),
    endReason: state.endReason,
  };
}
