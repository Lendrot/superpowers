/**
 * Doc 04 §4.0 — der Vertrag einer Aktion.
 *
 * Die beiden Regeln, die den Rest der Architektur tragen:
 * - `generate` liefert nur LEGALE Kandidaten (spaeter zusaetzlich wissensgefiltert).
 * - `resolve` ist REIN: es liest den State und gibt Effects zurueck, es mutiert nie.
 */

import type { EventDraft } from '../core/eventLog.js';
import type { RngBundle } from '../core/rng.js';
import type {
  ActionTier,
  ActionType,
  Agent,
  AgentAction,
  Effect,
  JsonValue,
  RejectReason,
  Round,
  WorldState,
} from '../core/types.js';
import type { StockLedger } from './stockLedger.js';

export interface ActionCandidate {
  type: ActionType;
  params: Record<string, JsonValue>;
  /** stabiler Kurzschluessel fuer Trace und Statistik, z. B. `gather_resource:food` */
  label: string;
}

export interface ActionContext {
  state: Readonly<WorldState>;
  round: Round;
  rng: RngBundle;
  /**
   * Bestandsreservierung der laufenden Runde (Doc 08 §8.1, Stufe 5). Zwei
   * Agenten, die denselben Bestand ernten wollen, sehen hier, was vor ihnen
   * schon vergeben wurde — first-come-first-served nach Auflösungsreihenfolge
   * (Doc 04 §4.3), nicht anteilig.
   */
  ledger: StockLedger;
}

export type PreconditionResult = { ok: true } | { ok: false; reason: RejectReason; detail: string };

export interface ResolveResult {
  effects: Effect[];
  events: EventDraft[];
}

export interface ActionDef {
  type: ActionType;
  tier: ActionTier;
  cost: { energy: number };
  /** Runden bis zur naechsten Ausfuehrbarkeit; 0 = kein Cooldown */
  cooldown: number;
  requiresTarget: boolean;
  allowsStatement: boolean;
  generate(agent: Readonly<Agent>, ctx: ActionContext): ActionCandidate[];
  precondition(action: AgentAction, ctx: ActionContext): PreconditionResult;
  resolve(action: AgentAction, ctx: ActionContext): ResolveResult;
}

export const OK: PreconditionResult = { ok: true };

export function reject(reason: RejectReason, detail: string): PreconditionResult {
  return { ok: false, reason, detail };
}
