/**
 * Doc 08 §8.1 — Validierungskette vor jedem State Change.
 *
 * Implementiert sind im Kern die Stufen, die es ohne Ziele, Ressourcenangebote
 * und Statements ueberhaupt geben kann:
 *
 *   1 Schema             ✔  (Zod, `core/schemas.ts`)
 *   2 Identity           ✔
 *   3 Target             —  keine zielgerichtete Aktion in Schritt 1
 *   4 Precondition       ✔  (`ActionDef.precondition`)
 *   5 Resource           ✔  soweit anwendbar: ueber die `EffectProjection`
 *   6 Knowledge          ✔  (`allowsStatement` + R1 im Truth-Validator)
 *   7 TRUTH              ✔  (`truthValidator.ts`, R1–R7 + R9)
 *   8 Parameter clamp    —  keine numerischen Parameter in Schritt 1
 *   9 Effect sanity      ✔  (`EffectProjection`)
 *
 * Die Reihenfolge ist Teil des Vertrags: der erste Fehler bricht ab.
 */

import { findAction } from '../actions/registry.js';
import type { ActionContext } from '../actions/types.js';
import { RESOURCE_KINDS } from '../core/resources.js';
import { agentActionSchema } from '../core/schemas.js';
import type {
  AgentAction,
  AgentId,
  Effect,
  InfoId,
  KnowledgeEntry,
  LocationId,
  Needs,
  RejectReason,
  ResourceKind,
  WorldState,
} from '../core/types.js';
import { validateStatement } from './truthValidator.js';

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: RejectReason; detail: string };

export function validateAction(action: AgentAction, ctx: ActionContext): ValidationResult {
  // Stufe 1 — Schema
  const parsed = agentActionSchema.safeParse(action);
  if (!parsed.success) {
    return { ok: false, reason: 'schema_invalid', detail: parsed.error.issues.map((i) => i.message).join('; ') };
  }

  // Stufe 2 — Identity
  const agent = ctx.state.agents[action.actorId];
  if (!agent) {
    return { ok: false, reason: 'actor_invalid', detail: `Agent ${action.actorId} existiert nicht` };
  }
  if (!agent.alive) {
    return { ok: false, reason: 'actor_invalid', detail: `Agent ${action.actorId} ist ausgeschieden` };
  }

  const def = findAction(action.type);
  if (!def) {
    return {
      ok: false,
      reason: 'precondition_failed',
      detail: `Aktion ${action.type} ist nicht implementiert`,
    };
  }

  const readyAt = agent.cooldowns[action.type];
  if (readyAt !== undefined && ctx.round < readyAt) {
    return {
      ok: false,
      reason: 'precondition_failed',
      detail: `${action.type} erst ab Runde ${readyAt} wieder moeglich`,
    };
  }

  // Stufe 4 — Precondition der Aktion selbst
  const pre = def.precondition(action, ctx);
  if (!pre.ok) {
    return { ok: false, reason: pre.reason, detail: pre.detail };
  }

  // Stufe 6 — Knowledge. Darf diese Aktion ueberhaupt etwas sagen?
  // Doc 04 §4.0: nur soziale Aktionen tragen ein Statement. Eine Ernte mit
  // angehaengter Behauptung ist kein Wahrheitsproblem, sondern eine Aktion, die
  // es so nicht gibt.
  if (action.statement && !def.allowsStatement) {
    return {
      ok: false,
      reason: 'precondition_failed',
      detail: `${action.type} erlaubt kein Statement`,
    };
  }

  // Stufe 7 — TRUTH. Der eigentliche Kern des Projekts (Doc 08 §8.2).
  if (action.statement) {
    const truth = validateStatement(action.statement, agent, {
      round: ctx.round,
      config: ctx.state.config,
      statementLog: ctx.state.statementLog,
      infoRegistry: ctx.state.infoRegistry,
    });
    if (!truth.ok) {
      return { ok: false, reason: truth.reason, detail: truth.detail };
    }
  }

  return { ok: true };
}

/**
 * Stufe 9 — Effect Sanity, und zugleich die Buchhaltung der laufenden Runde.
 *
 * Prueft eine Effektliste gegen den State PLUS alles, was in dieser Runde schon
 * akzeptiert wurde, ohne den State zu kopieren. Ein `structuredClone` pro
 * Aktion waere bei 40 Agenten × 400 Runden 16 000 Kopien des Weltzustands.
 *
 * Sie ist zugleich Stufe 9 der Validierungskette **und** die Auskunft, die
 * Aktionen beim Aufloesen brauchen ("wieviel liegt hier noch?", "was hat der
 * andere noch?"). Beides muss dieselbe Quelle haben: als das getrennt war —
 * ein Ledger fuer Ortsbestaende, eine Projektion fuer Agentenvorraete —,
 * rechnete ein Beutezug gegen einen Stand, von dem die andere Haelfte nichts
 * wusste, und die Kette lehnte die eigene Aktion ab.
 */
export class EffectProjection {
  private readonly resourceDelta = new Map<string, number>();
  private readonly stockDelta = new Map<string, number>();
  private readonly needDelta = new Map<string, number>();
  private readonly knowledgeDelta = new Map<string, KnowledgeEntry>();
  private readonly eliminated = new Set<AgentId>();

  constructor(private readonly state: Readonly<WorldState>) {}

  /**
   * Ist dieser Agent in der laufenden Runde bereits gefallen?
   *
   * Der Tod wird erst in Phase 7 geschrieben, aber schon in Phase 6
   * beschlossen. Wer das nicht beruecksichtigt, laesst einen Toten noch
   * handeln oder schlaegt auf ihn ein — und der StateMutator wirft dann zu
   * Recht, weil Effekte fuer Ausgeschiedene unzulaessig sind.
   */
  isEliminated(agentId: AgentId): boolean {
    return this.eliminated.has(agentId);
  }

  /** Was an diesem Ort in dieser Runde noch frei ist. */
  stockAvailable(locationId: LocationId, kind: ResourceKind): number {
    return this.stockAmount(locationId, kind);
  }

  /** Was dieser Agent in dieser Runde noch besitzt. */
  agentResource(agentId: AgentId, kind: ResourceKind): number {
    return this.agentAmount(agentId, kind);
  }

  /**
   * Der Beduerfniswert dieses Agenten mit allen `need`-Effekten dieser Runde
   * bereits eingerechnet — nicht nur der Stand vom Rundenbeginn.
   *
   * Naeherung, keine exakte Wiederholung: der `StateMutator` klemmt jeden
   * Effekt einzeln auf 0..100, hier wird die Summe der Deltas einmal am Ende
   * geklemmt. Bei mehreren `need`-Effekten fuer denselben Agenten in
   * derselben Runde, von denen einer allein schon eine Grenze erreicht haette,
   * kann das geringfuegig abweichen. Fuer eine Kampfentscheidung — der einzige
   * heutige Aufrufer — ist das die richtige Grenze der Genauigkeit: exakt
   * waere nur eine geordnete Wiederholung aller Effekte, und die Runde
   * beschliesst ohnehin erst in Phase 7 endgueltig, wer wieviel Energie hat.
   */
  needAvailable(agentId: AgentId, need: keyof Needs): number {
    const base = this.state.agents[agentId]?.needs[need] ?? 0;
    const raw = base + (this.needDelta.get(`${agentId}:${need}`) ?? 0);
    return Math.max(0, Math.min(100, raw));
  }

  /**
   * Der `KnowledgeEntry` dieses Agenten zu dieser Info, wie er nach allen
   * bisher in dieser Runde uebernommenen `knowledge`-Effekten aussieht — nicht
   * nur der Stand vom Rundenbeginn.
   *
   * Noetig, weil `share_information`/`request_information` zweimal denselben
   * Fehler machen koennten, ohne diese Methode: Erstens vergleicht
   * `deriveToldEntry` das Angebot gegen das, was der Empfaenger schon hat —
   * hat der Empfaenger in DIESER Runde bereits von jemand anderem gehoert
   * (fruehere Aufloesung, gleiche Klasse), muss das der Vergleich sehen, sonst
   * gewinnt blind der zuletzt aufgeloeste Effekt statt die hoehere Sicherheit.
   * Zweitens aktualisiert der Sender beim Teilen sein eigenes `sharedWith` —
   * dafuer braucht es den AKTUELLEN eigenen Eintrag, nicht den vom
   * Rundenbeginn, sonst wuerde das Update einen Eintrag ueberschreiben, den
   * der Sender selbst erst in dieser Runde bekommen hat.
   */
  knowledgeEntry(agentId: AgentId, infoId: InfoId): KnowledgeEntry | undefined {
    return this.knowledgeDelta.get(`${agentId}:${infoId}`) ?? this.state.agents[agentId]?.knowledge[infoId];
  }

  check(effects: readonly Effect[]): ValidationResult {
    const pendingResource = new Map<string, number>();
    const pendingStock = new Map<string, number>();

    for (const item of effects) {
      if (item.t === 'resource') {
        for (const kind of RESOURCE_KINDS) {
          const delta = item.delta[kind];
          if (!delta) continue;
          const key = `${item.agentId}:${kind}`;
          const next = this.agentAmount(item.agentId, kind) + (pendingResource.get(key) ?? 0) + delta;
          if (next < 0) {
            return {
              ok: false,
              reason: 'insufficient_resources',
              detail: `${item.agentId}.${kind} wuerde auf ${next} fallen`,
            };
          }
          pendingResource.set(key, (pendingResource.get(key) ?? 0) + delta);
        }
      } else if (item.t === 'location_stock') {
        for (const kind of RESOURCE_KINDS) {
          const delta = item.delta[kind];
          if (!delta) continue;
          const key = `${item.locationId}:${kind}`;
          const base = this.stockAmount(item.locationId, kind);
          const next = base + (pendingStock.get(key) ?? 0) + delta;
          const capacity = this.state.locations[item.locationId]?.capacity[kind] ?? 0;
          if (next < 0) {
            return { ok: false, reason: 'effect_invalid', detail: `${key} wuerde auf ${next} fallen` };
          }
          if (next > capacity) {
            return {
              ok: false,
              reason: 'effect_invalid',
              detail: `${key} wuerde capacity ${capacity} ueberschreiten (${next})`,
            };
          }
          pendingStock.set(key, (pendingStock.get(key) ?? 0) + delta);
        }
      }
    }

    return { ok: true };
  }

  /** Uebernimmt gepruefte Effekte in die Projektion der laufenden Runde. */
  commit(effects: readonly Effect[]): void {
    for (const item of effects) {
      if (item.t === 'eliminate') {
        this.eliminated.add(item.agentId);
      } else if (item.t === 'resource') {
        for (const kind of RESOURCE_KINDS) {
          const delta = item.delta[kind];
          if (!delta) continue;
          const key = `${item.agentId}:${kind}`;
          this.resourceDelta.set(key, (this.resourceDelta.get(key) ?? 0) + delta);
        }
      } else if (item.t === 'location_stock') {
        for (const kind of RESOURCE_KINDS) {
          const delta = item.delta[kind];
          if (!delta) continue;
          const key = `${item.locationId}:${kind}`;
          this.stockDelta.set(key, (this.stockDelta.get(key) ?? 0) + delta);
        }
      } else if (item.t === 'need') {
        for (const need of ['satiety', 'energy'] as const) {
          const delta = item.delta[need];
          if (!delta) continue;
          const key = `${item.agentId}:${need}`;
          this.needDelta.set(key, (this.needDelta.get(key) ?? 0) + delta);
        }
      } else if (item.t === 'knowledge') {
        // Der letzte Effekt gewinnt — dieselbe Reihenfolge, in der Phase 7 sie
        // gleich anwenden wird, weil beide der Aufloesungsreihenfolge folgen.
        this.knowledgeDelta.set(`${item.agentId}:${item.entry.infoId}`, item.entry);
      }
    }
  }

  private agentAmount(agentId: AgentId, kind: ResourceKind): number {
    const base = this.state.agents[agentId]?.resources[kind] ?? 0;
    return base + (this.resourceDelta.get(`${agentId}:${kind}`) ?? 0);
  }

  private stockAmount(locationId: LocationId, kind: ResourceKind): number {
    const base = this.state.locations[locationId]?.stock[kind] ?? 0;
    return base + (this.stockDelta.get(`${locationId}:${kind}`) ?? 0);
  }
}
