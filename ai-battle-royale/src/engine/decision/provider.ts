/**
 * Doc 05 §5.3 — `DecisionProvider`.
 *
 * Die Engine kennt nur dieses Interface. `PolicyProvider` (deterministisch) ist
 * der Normalfall; `ScriptedProvider` dient Tests; `LlmProvider` (T33) und
 * `HumanProvider` (Player Mode, P2) kommen spaeter.
 *
 * Bewusst synchron: Doc 02 §2.4 sammelt eskalierte LLM-Anfragen ohnehin ueber
 * die ganze Runde und fuehrt sie als einen Batch aus. Die Eskalation wird
 * deshalb eine eigene, asynchrone Stufe vor dieser hier — nicht ein `await` in
 * jedem Entscheidungspfad. Eine durchgehend asynchrone Engine waere heute reine
 * Ansteckung ohne Nutzen.
 */

import type { Agent, AgentAction, LocationId, Round, WorldState } from '../core/types.js';
import type { RngBundle } from '../core/rng.js';
import type { ActionCandidate } from '../actions/types.js';

export interface DecisionContext {
  state: Readonly<WorldState>;
  round: Round;
  rng: RngBundle;
  /**
   * Wieviele lebende Agenten an jedem Ort stehen.
   *
   * Zulaessiges Wissen: wer an einem Ort steht, sieht die Anwesenden — dafuer
   * braucht es kein Wahrnehmungssystem. Die Policy darf davon nur den Eintrag
   * ihres eigenen Ortes lesen; ab T23 erzwingt das die `AgentView`-Signatur,
   * bis dahin ist es eine Regel, die im Review steht.
   */
  occupancy: Readonly<Record<LocationId, number>>;
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
  decide(agent: Readonly<Agent>, candidates: readonly ActionCandidate[], ctx: DecisionContext): Decision;
}
