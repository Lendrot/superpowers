/**
 * Doc 04 §4.0 — der Vertrag einer Aktion.
 *
 * Die beiden Regeln, die den Rest der Architektur tragen:
 * - `generate` liefert nur LEGALE Kandidaten (spaeter zusaetzlich wissensgefiltert).
 * - `resolve` ist REIN: es liest den State und gibt Effects zurueck, es mutiert nie.
 */

import type { EventDraft, EventLog } from '../core/eventLog.js';
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
  Statement,
  WorldState,
} from '../core/types.js';
import type { EffectProjection } from '../validation/validateAction.js';

export interface ActionCandidate {
  type: ActionType;
  params: Record<string, JsonValue>;
  /** stabiler Kurzschluessel fuer Trace und Statistik, z. B. `gather_resource:food` */
  label: string;
  /**
   * Nur bei `allowsStatement`. `generate` liest den State, weil nur er
   * Legalitaet garantieren kann (Doc 08 §8.2.4, erste Verteidigungslinie) —
   * deshalb entsteht der Aussageninhalt hier und nicht erst in der Policy, die
   * nur die `AgentView` sieht und den Wahrheitsgehalt gar nicht pruefen koennte.
   */
  statement?: Statement;
}

export interface ActionContext {
  state: Readonly<WorldState>;
  round: Round;
  rng: RngBundle;
  /**
   * Die Buchhaltung der laufenden Runde (Doc 08 §8.1, Stufe 5). Zwei Agenten,
   * die denselben Bestand ernten wollen, sehen hier, was vor ihnen schon
   * vergeben wurde — first-come-first-served nach Auflösungsreihenfolge
   * (Doc 04 §4.3), nicht anteilig. Dasselbe gilt fuer Vorraete, die in dieser
   * Runde schon den Besitzer gewechselt haben.
   */
  projection: EffectProjection;
  /**
   * Nur `log.nextSeq` ist fuer Aktionen gedacht: eine Aktion, die einen
   * `KnowledgeEntry` direkt erzeugt (T18, nicht ueber Phase 2), braucht dessen
   * `sourceEventId` VOR dem eigentlichen `emit()` — `eventId(ctx.round,
   * ctx.log.nextSeq)` sagt vorher, welche Id das eigene erste zurueckgegebene
   * Event bekommen wird. Das ist sicher, weil `resolve` und `emit` synchron
   * und ohne fremde Zwischenschritte aufeinanderfolgen (`runRound.ts`).
   */
  log: EventLog;
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
