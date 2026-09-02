/**
 * Doc 05 §5.3 — `DecisionProvider`.
 *
 * Die Engine kennt nur dieses Interface. `PolicyProvider` (deterministisch) ist
 * der Normalfall; `ScriptedProvider` dient Tests; `LlmProvider` (T33) und
 * `HumanProvider` (Player Mode, P2) kommen spaeter.
 *
 * `decide` bekommt eine `AgentView`, nicht den `WorldState` — das ist die
 * Absicherung aus Doc 13 §4, und sie wirkt nur, solange sie in der Signatur
 * steht. Wer hier den State durchreicht, hebt sie auf.
 *
 * Bewusst synchron: Doc 02 §2.4 sammelt eskalierte LLM-Anfragen ohnehin ueber
 * die ganze Runde und fuehrt sie als einen Batch aus. Die Eskalation wird
 * deshalb eine eigene, asynchrone Stufe vor dieser hier — nicht ein `await` in
 * jedem Entscheidungspfad.
 */

import type { AgentView } from '../agents/agentView.js';
import type { AgentAction, Round } from '../core/types.js';
import type { RngBundle } from '../core/rng.js';
import type { ActionCandidate } from '../actions/types.js';

export interface DecisionContext {
  round: Round;
  rng: RngBundle;
}

export interface ScoredCandidate {
  candidate: ActionCandidate;
  score: number;
  /** Doc 05 §5.2 — Beitraege einzeln, damit "warum?" beantwortbar bleibt. */
  breakdown: Record<string, number>;
}

export interface Decision {
  action: AgentAction;
  scored: ScoredCandidate[];
}

export interface DecisionProvider {
  readonly name: string;
  decide(view: Readonly<AgentView>, candidates: readonly ActionCandidate[], ctx: DecisionContext): Decision;
}
