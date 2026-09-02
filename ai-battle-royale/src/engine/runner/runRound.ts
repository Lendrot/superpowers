/**
 * T07 — Rundenskelett.
 *
 * Implementiert sind die Phasen 1, 3, 4, 5, 6, 7 und 11 aus Doc 02 §2.3. Die
 * uebrigen fehlen NICHT aus Versehen:
 *
 *   Phase 2  Perception   → T11 (einzige Stelle, an der Wissen entsteht)
 *   Phase 8  Consequence  → T19 (Beziehungsdeltas)
 *   Phase 9  Memory       → T22
 *   Phase 10 Reflection   → T24/T34
 *
 * Die Reihenfolge der vorhandenen Phasen ist Teil des Determinismus-Vertrags
 * und darf nicht umsortiert werden (Doc 02 §2.3).
 *
 * `runRound` ist bewusst nur die Verkettung — jede Phase ist eine eigene,
 * einzeln testbare Funktion (Doc 13 §8).
 */

import { createStockLedger } from '../actions/stockLedger.js';
import { orderActions } from '../actions/resolutionOrder.js';
import { requireAction } from '../actions/registry.js';
import type { ActionContext } from '../actions/types.js';
import { aliveAgents, locationIds } from '../core/access.js';
import type { EventLog } from '../core/eventLog.js';
import type { RngBundle } from '../core/rng.js';
import type { AgentAction, Effect, LocationId, WorldEvent, WorldState } from '../core/types.js';
import { generateCandidates } from '../decision/candidates.js';
import type { DecisionProvider } from '../decision/provider.js';
import { applyEffects } from '../mutation/stateMutator.js';
import { EffectProjection, validateAction } from '../validation/validateAction.js';
import type { RejectCounts } from '../validation/rejectReasons.js';
import { emptyRejectCounts } from '../validation/rejectReasons.js';
import { scoringEffects } from '../world/scoring.js';
import { upkeepEffects } from '../world/upkeep.js';

export interface RoundDeps {
  rng: RngBundle;
  log: EventLog;
  provider: DecisionProvider;
}

export interface RoundResult {
  round: number;
  events: WorldEvent[];
  rejects: RejectCounts;
  /** Wie oft welche Aktion tatsaechlich aufgeloest wurde. */
  actionCounts: Record<string, number>;
  decisions: number;
  finished: boolean;
}

/** Einmal pro Runde statt einmal pro Kandidat — sonst ist es O(Agenten²). */
function countOccupants(state: Readonly<WorldState>): Record<LocationId, number> {
  const counts = {} as Record<LocationId, number>;
  for (const id of locationIds(state)) counts[id] = 0;
  for (const agent of aliveAgents(state)) counts[agent.location] = (counts[agent.location] ?? 0) + 1;
  return counts;
}

export function runRound(state: WorldState, deps: RoundDeps): RoundResult {
  if (state.status !== 'running') {
    throw new Error(`runRound: Match ist bereits beendet (${state.endReason ?? 'unbekannt'})`);
  }

  const round = state.round;
  const rejects = emptyRejectCounts();
  const actionCounts: Record<string, number> = {};
  const events: WorldEvent[] = [];

  const emit = (draft: Parameters<EventLog['append']>[0]): void => {
    events.push(deps.log.append(draft));
  };

  emit({
    round,
    type: 'round_started',
    locationId: null,
    payload: { alive: aliveAgents(state).length },
    visibility: { scope: 'public' },
    infoRefs: [],
  });

  // ── Phase 1 — Upkeep ───────────────────────────────────────────────────────
  applyEffects(state, upkeepEffects(state));

  // ── Phase 3 — Kandidaten & Phase 4 — Entscheidung ─────────────────────────
  // Ein Ledger fuer die ganze Runde: Kandidaten und Auflösung sehen denselben
  // Bestand, und was in Phase 6 vergeben wird, ist danach vergeben.
  const ledger = createStockLedger(state);
  const ctx: ActionContext = { state, round, rng: deps.rng, ledger };
  const occupancy = countOccupants(state);

  const chosen: AgentAction[] = [];
  for (const agent of aliveAgents(state)) {
    const candidates = generateCandidates(agent, ctx);
    const decision = deps.provider.decide(agent, candidates, { state, round, rng: deps.rng, occupancy });

    // ── Phase 5 — Validierung ───────────────────────────────────────────────
    const verdict = validateAction(decision.action, ctx);
    if (verdict.ok) {
      chosen.push(decision.action);
      continue;
    }

    rejects[verdict.reason] += 1;
    emit({
      round,
      type: 'action_rejected',
      actorId: agent.id,
      locationId: agent.location,
      payload: { action: decision.action.type, reason: verdict.reason, detail: verdict.detail },
      visibility: { scope: 'private', agentIds: [agent.id] },
      infoRefs: [],
    });

    // Doc 08 §8.1: nach einem Reject folgt Repair, dann der naechstbeste
    // Kandidat, dann `rest`. Repair braucht ein LLM-Ergebnis, das es hier nicht
    // gibt — also direkt der Fallback, der per Definition immer legal ist.
    chosen.push({ actorId: agent.id, type: 'rest', params: {}, source: 'fallback' });
  }

  // ── Phase 6 — Resolution ──────────────────────────────────────────────────
  const projection = new EffectProjection(state);
  const batch: Effect[] = [];

  for (const { action } of orderActions(chosen, state, round, deps.rng)) {
    const def = requireAction(action.type);
    const resolved = def.resolve(action, ctx);

    // Stufe 9 der Validierungskette: erst pruefen, dann in die Runde uebernehmen.
    const sanity = projection.check(resolved.effects);
    if (!sanity.ok) {
      rejects[sanity.reason] += 1;
      emit({
        round,
        type: 'action_rejected',
        actorId: action.actorId,
        locationId: state.agents[action.actorId]?.location ?? null,
        payload: { action: action.type, reason: sanity.reason, detail: sanity.detail },
        visibility: { scope: 'private', agentIds: [action.actorId] },
        infoRefs: [],
      });
      continue;
    }

    projection.commit(resolved.effects);
    batch.push(...resolved.effects);
    for (const draft of resolved.events) emit(draft);
    actionCounts[action.type] = (actionCounts[action.type] ?? 0) + 1;
  }

  // ── Phase 7 — Mutation ────────────────────────────────────────────────────
  applyEffects(state, batch);

  // ── Phase 11 — Scoring ────────────────────────────────────────────────────
  const scoring = scoringEffects(state);

  emit({
    round,
    type: 'round_ended',
    locationId: null,
    payload: { alive: scoring.aliveCount, actions: chosen.length },
    visibility: { scope: 'public' },
    infoRefs: [],
  });

  if (scoring.endReason) {
    emit({
      round,
      type: 'match_ended',
      locationId: null,
      payload: { reason: scoring.endReason, alive: scoring.aliveCount },
      visibility: { scope: 'public' },
      infoRefs: [],
    });
  }

  applyEffects(state, scoring.effects);

  return {
    round,
    events,
    rejects,
    actionCounts,
    decisions: chosen.length,
    // Nicht `state.status` lesen: der Typ ist an dieser Stelle bereits auf
    // 'running' verengt, weil TypeScript die Mutation im Mutator nicht sieht.
    finished: scoring.endReason !== null,
  };
}
