/**
 * T07 — Rundenskelett.
 *
 * Implementiert sind die Phasen 1, 2, 3, 4, 5, 6, 7, 8, 9 und 11 aus Doc 02
 * §2.3. Die uebrigen fehlen NICHT aus Versehen:
 *
 *   Phase 10 Reflection   → T24/T34
 *
 * Die Reihenfolge der vorhandenen Phasen ist Teil des Determinismus-Vertrags
 * und darf nicht umsortiert werden (Doc 02 §2.3).
 *
 * `runRound` ist bewusst nur die Verkettung — jede Phase ist eine eigene,
 * einzeln testbare Funktion (Doc 13 §8).
 */

import { orderActions } from '../actions/resolutionOrder.js';
import { requireAction } from '../actions/registry.js';
import type { ActionContext } from '../actions/types.js';
import { buildAgentView } from '../agents/agentView.js';
import { aliveAgents } from '../core/access.js';
import type { EventLog } from '../core/eventLog.js';
import type { RngBundle } from '../core/rng.js';
import type { AgentAction, AgentId, Effect, WorldEvent, WorldState } from '../core/types.js';
import { generateCandidates } from '../decision/candidates.js';
import type { DecisionProvider } from '../decision/provider.js';
import { statementInfoId } from '../information/statements.js';
import { statementRecordFor } from '../information/statementLog.js';
import { memoryEffects } from '../memory/episodes.js';
import { effect } from '../mutation/effects.js';
import { applyEffects } from '../mutation/stateMutator.js';
import { EffectProjection, validateAction } from '../validation/validateAction.js';
import type { RejectCounts } from '../validation/rejectReasons.js';
import { emptyRejectCounts } from '../validation/rejectReasons.js';
import { consequence } from '../world/consequence.js';
import { perceptionEffects } from '../world/perception.js';
import { relationshipEffectsFor } from '../world/relationships.js';
import { scoringEffects } from '../world/scoring.js';
import { upkeep } from '../world/upkeep.js';

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
  /** Wieviele Wissenseintraege Phase 2 geschrieben hat. */
  perceived: number;
  /**
   * Aktionen, die waehrend der Aufloesung ins Leere liefen, weil ihr Ziel in
   * derselben Runde gefallen ist. Kein Validierungsfehler — siehe unten.
   */
  aborted: number;
  /** Wieviele Agenten in Phase 8 Erfahrung gewonnen oder verloren haben. */
  developed: number;
  /** Wieviele Episoden Phase 9 geschrieben hat. */
  remembered: number;
  /** Wer in dieser Runde ausgeschieden ist. */
  eliminated: AgentAction['actorId'][];
  finished: boolean;
}

export function runRound(state: WorldState, deps: RoundDeps): RoundResult {
  if (state.status !== 'running') {
    throw new Error(`runRound: Match ist bereits beendet (${state.endReason ?? 'unbekannt'})`);
  }

  const round = state.round;
  const rejects = emptyRejectCounts();
  const actionCounts: Record<string, number> = {};
  let aborted = 0;
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
  const upkeepResult = upkeep(state);
  for (const eliminated of upkeepResult.events) emit(eliminated);
  applyEffects(state, upkeepResult.effects);

  // ── Phase 2 — Perception ──────────────────────────────────────────────────
  // Verarbeitet die Events der Vorrunde. In Runde 1 gibt es keine — dann
  // beginnt das Match mit Agenten, die nichts wissen, und das ist richtig so.
  const perception = perceptionEffects(state, deps.log.byRound(round - 1), round);
  applyEffects(state, perception.effects);

  // ── Phase 3 — Kandidaten & Phase 4 — Entscheidung ─────────────────────────
  // Ein Ledger fuer die ganze Runde: Kandidaten und Auflösung sehen denselben
  // Bestand, und was in Phase 6 vergeben wird, ist danach vergeben.
  // Eine Buchhaltung fuer die ganze Runde: sie beantwortet den Aktionen, was
  // noch da ist, und prueft zugleich Stufe 9 der Validierungskette.
  const projection = new EffectProjection(state);
  const ctx: ActionContext = { state, round, rng: deps.rng, projection, log: deps.log };

  const chosen: AgentAction[] = [];
  for (const agent of aliveAgents(state)) {
    // `generate` liest den State, weil nur er beantworten kann, was wirklich
    // legal ist (Doc 08 §8.2.4, erste Verteidigungslinie) — und weil alles, was
    // dabei zaehlt, ohnehin am eigenen Ort sichtbar ist. `decide` bekommt
    // dagegen nur die AgentView: bewerten darf der Agent nur, was er weiss.
    const candidates = generateCandidates(agent, ctx);
    const view = buildAgentView(state, agent.id);
    const decision = deps.provider.decide(view, candidates, { round, rng: deps.rng });

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
  const batch: Effect[] = [];

  for (const { action } of orderActions(chosen, state, round, deps.rng)) {
    // Wer in dieser Runde bereits gefallen ist, handelt nicht mehr — und wird
    // auch nicht mehr angegriffen. Der Tod steht erst nach Phase 7 im State,
    // ist aber hier schon beschlossen; ohne diese Pruefung schluege jemand auf
    // einen Toten ein, und der StateMutator wuerde das zu Recht als
    // Invariantenbruch werfen.
    const target = action.params['target'];
    const targetGone = typeof target === 'string' && projection.isEliminated(target as AgentId);
    if (projection.isEliminated(action.actorId) || targetGone) {
      // Kein Validierungsfehler: die Kette hat die Aktion zu Recht
      // durchgelassen, das Ziel lebte zu dem Zeitpunkt noch. Es faellt erst
      // waehrend der Aufloesung. Wuerde das als Reject zaehlen, waere die
      // Kennzahl aus Doc 08 §8.1 ("ueber 2 % ist ein Bug") nicht mehr
      // aussagekraeftig — dieselbe Trennung wie zwischen `gather_failed` und
      // `action_rejected`.
      aborted += 1;
      emit({
        round,
        type: 'attack_aborted',
        actorId: action.actorId,
        locationId: state.agents[action.actorId]?.location ?? null,
        payload: { action: action.type, reason: 'target_already_down' },
        visibility: { scope: 'private', agentIds: [action.actorId] },
        infoRefs: [],
      });
      continue;
    }
    const def = requireAction(action.type);
    const resolved = def.resolve(action, ctx);

    // Zentrales R7-Gedaechtnis: JEDE Aktion mit einem eigenen `statement`
    // bekommt es automatisch, ohne dass die Aktion selbst daran denken muss.
    // Nur das eigene Statement der obersten Aktion — eine Inline-Antwort
    // (`request_information`) traegt ihres selbst (siehe dort), weil sie nicht
    // dem Akteur, sondern dem Ziel gehoert.
    if (action.statement) {
      const infoId = statementInfoId(action.statement);
      const entry = infoId ? state.agents[action.actorId]?.knowledge[infoId] : undefined;
      const record = statementRecordFor(action.statement, entry, round);
      if (record) resolved.effects.push(effect.statement(action.actorId, record));
    }

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

  // ── Phase 8 — Consequence ─────────────────────────────────────────────────
  // Faehigkeiten und Veranlagung folgen aus dem, was gerade geschehen ist.
  // Anders als Perception laeuft das NICHT eine Runde nach: wer eben gekaempft
  // hat, ist danach staerker. Dieselbe Regel gilt fuer Beziehungen (Doc 03
  // §3.3): wer gerade betrogen wurde, misstraut sofort, nicht naechste Runde.
  const consequences = consequence(state, events, perception.newKnowledgePerAgent);
  applyEffects(state, [...consequences.effects, ...relationshipEffectsFor(state, events)]);

  // ── Phase 9 — Memory ───────────────────────────────────────────────────────
  // Dieselben Events wie Phase 8, nicht die der Vorrunde (siehe Kopfkommentar
  // von `memory/episodes.ts`): Ortswechsel dieser Runde sind bereits
  // aufgeloest, die aktuellen Positionen sind also die richtigen.
  const memory = memoryEffects(state, events, round);
  applyEffects(state, memory.effects);

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
    perceived: perception.written,
    aborted,
    developed: consequences.changed,
    remembered: memory.written,
    eliminated: upkeepResult.events.flatMap((e) => (e.actorId ? [e.actorId] : [])),
    // Nicht `state.status` lesen: der Typ ist an dieser Stelle bereits auf
    // 'running' verengt, weil TypeScript die Mutation im Mutator nicht sieht.
    finished: scoring.endReason !== null,
  };
}
