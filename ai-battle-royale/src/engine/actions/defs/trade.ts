/**
 * Doc 04 §4.1 Nr. 5 — `trade`.
 *
 * "Angebot → Zielagent reagiert inline (accept/counter/decline)" (Doc 04
 * §4.1). Wie bei `request_information` entsteht die Reaktion synchron in
 * `resolve`, verbraucht keinen eigenen Rundenzug des Ziels (Doc 04 §4.1,
 * Ergaenzende Nicht-Aktionen) und braucht dafuer keinen Wurf: eine
 * Kauf-Entscheidung ist eine Bewertung, kein Gluecksspiel — anders als
 * `attackAction`s `luckyRoll` oder `requestInformationAction`s Bereitschaft
 * zu antworten (dort ist "reden wollen" eine Charakterfrage, hier eine
 * Rechnung).
 *
 * Verhandlung in genau einer Runde: lehnt das Ziel das Angebot nicht rundweg
 * ab, aber findet es auch nicht fair, senkt es seine eigene Forderung
 * (`want`) auf den Punkt, an dem es fuer das Ziel selbst gerade noch fair
 * waere. Der urspruengliche Anbieter bewertet dieses Gegenangebot sofort mit
 * derselben Rechnung — kein zweiter Umlauf, keine Endlosschleife.
 */

import { getAgent } from '../../core/access.js';
import type { EventDraft } from '../../core/eventLog.js';
import { RESOURCE_KINDS } from '../../core/resources.js';
import type { Agent, AgentId, Effect, JsonValue, Resources, ResourceKind } from '../../core/types.js';
import { effect } from '../../mutation/effects.js';
import type { ActionCandidate, ActionContext, ActionDef } from '../types.js';
import { OK, reject } from '../types.js';

/**
 * Relativer Wert je Einheit. **[ANNAHME]**, aus dem bereits vorhandenen
 * Zahlenwerk abgeleitet statt frei gegriffen: `agent_resource:coins` braucht
 * in `config.buckets` sechsmal mehr Menge, um als `some` zu gelten, als Food
 * oder Materials (Doc 08 §8.2.2) — Muenzen sind also die haeufigere,
 * geringerwertigere Einheit. Ebenso startet jeder Agent fix mit 10 Coins,
 * aber nur 0–6 Food/Materials (`createAgent.ts`).
 */
const RESOURCE_VALUE: Record<ResourceKind, number> = { food: 1.2, materials: 1.5, coins: 0.4 };

/** Ab diesem Bestand gilt eine Ressource als Ueberschuss, den man hergeben kann. **[ANNAHME]** */
const SURPLUS_THRESHOLD: Record<ResourceKind, number> = { food: 15, materials: 12, coins: 30 };

/** Wieviel `generate` auf einmal anbietet. **[ANNAHME]** */
const TRADE_UNIT = 3;

/** Unterhalb dieses Verhaeltnisses lohnt sich nicht einmal eine Gegenofferte. */
const COUNTER_ZONE_FACTOR = 0.5;

export const tradeAction: ActionDef = {
  type: 'trade',
  tier: 'social',
  cost: { energy: 0 }, // [ANNAHME], wie share_information/request_information
  cooldown: 0,
  requiresTarget: true,
  allowsStatement: true, // Doc 04 §4.1: "ja" — hier ungenutzt, siehe T21 (Pledges)

  generate(agent, ctx): ActionCandidate[] {
    const give = RESOURCE_KINDS.map((kind) => ({ kind, over: agent.resources[kind] - SURPLUS_THRESHOLD[kind] }))
      .filter((entry) => entry.over > 0)
      .sort((a, b) => b.over - a.over || a.kind.localeCompare(b.kind))[0]?.kind;
    if (!give) return [];

    const want = RESOURCE_KINDS.filter((kind) => kind !== give)
      .map((kind) => ({ kind, under: SURPLUS_THRESHOLD[kind] - agent.resources[kind] }))
      .sort((a, b) => b.under - a.under || a.kind.localeCompare(b.kind))[0]!.kind;

    const giveAmount = Math.min(TRADE_UNIT, agent.resources[give]);
    if (giveAmount <= 0) return [];
    const wantAmount = Math.max(1, Math.round((giveAmount * RESOURCE_VALUE[give]) / RESOURCE_VALUE[want]));

    return targetsAt(agent.id, agent.location, ctx).map((target) => ({
      type: 'trade' as const,
      params: {
        target: target.id,
        give: { [give]: giveAmount } as JsonValue,
        want: { [want]: wantAmount } as JsonValue,
      },
      label: `trade:${target.id}:${give}->${want}`,
    }));
  },

  precondition(action, ctx) {
    const agent = getAgent(ctx.state, action.actorId);
    const targetId = readTarget(action.params);
    const give = readResourceBundle(action.params['give']);
    const want = readResourceBundle(action.params['want']);
    if (!targetId || !give || !want) {
      return reject('schema_invalid', `trade ohne gueltige Parameter: ${JSON.stringify(action.params)}`);
    }
    if (Object.keys(give).length === 0 || Object.keys(want).length === 0) {
      return reject('schema_invalid', 'trade ohne Angebot oder ohne Forderung');
    }
    if (RESOURCE_KINDS.some((kind) => (give[kind] ?? 0) > 0 && (want[kind] ?? 0) > 0)) {
      return reject('schema_invalid', 'trade bietet und fordert dieselbe Ressourcenart');
    }
    if (targetId === agent.id) {
      return reject('target_invalid', 'Ein Agent kann nicht mit sich selbst handeln');
    }
    const target = ctx.state.agents[targetId];
    if (!target) return reject('target_invalid', `Agent ${targetId} existiert nicht`);
    if (!target.alive) return reject('target_invalid', `Agent ${targetId} ist ausgeschieden`);
    if (target.location !== agent.location) {
      return reject('target_invalid', `Agent ${targetId} ist nicht am selben Ort`);
    }

    for (const kind of RESOURCE_KINDS) {
      const amount = give[kind] ?? 0;
      if (amount < 0 || !Number.isInteger(amount)) {
        return reject('schema_invalid', `trade: give.${kind} muss eine ganze Zahl >= 0 sein`);
      }
      if (amount > ctx.projection.agentResource(agent.id, kind)) {
        return reject('insufficient_resources', `${agent.id} hat nicht genug ${kind} fuer das Angebot`);
      }
    }
    for (const kind of RESOURCE_KINDS) {
      const amount = want[kind] ?? 0;
      if (amount < 0 || !Number.isInteger(amount)) {
        return reject('schema_invalid', `trade: want.${kind} muss eine ganze Zahl >= 0 sein`);
      }
    }

    return OK;
  },

  resolve(action, ctx) {
    const proposer = getAgent(ctx.state, action.actorId);
    const targetId = readTarget(action.params);
    const give = readResourceBundle(action.params['give']);
    const want = readResourceBundle(action.params['want']);
    if (!targetId || !give || !want) {
      throw new Error('trade ohne gueltige Parameter in resolve — Validierung uebersprungen?');
    }
    const responder = getAgent(ctx.state, targetId);
    const giveKind = RESOURCE_KINDS.find((kind) => (give[kind] ?? 0) > 0)!;
    const wantKind = RESOURCE_KINDS.find((kind) => (want[kind] ?? 0) > 0)!;
    const giveAmount = give[giveKind] ?? 0;
    const originalWantAmount = want[wantKind] ?? 0;

    const events: EventDraft[] = [];

    // Erste Bewertung: aus Sicht des Ziels — es empfaengt `give`, gibt `want` her.
    const responderThreshold = acceptThresholdFor(responder, proposer.id);
    const initialRatio = ratioOf(giveAmount, giveKind, originalWantAmount, wantKind);

    let finalWantAmount = originalWantAmount;
    let accepted = initialRatio >= responderThreshold;

    if (!accepted && initialRatio >= responderThreshold * COUNTER_ZONE_FACTOR) {
      // Gegenangebot: die eigene Forderung so weit senken, dass der Tausch aus
      // eigener Sicht gerade noch fair ist — begrenzt durch das, was das Ziel
      // tatsaechlich noch besitzt.
      const fairAmount = Math.ceil(
        (giveAmount * RESOURCE_VALUE[giveKind]) / (RESOURCE_VALUE[wantKind] * responderThreshold),
      );
      const available = ctx.projection.agentResource(responder.id, wantKind);
      const counterAmount = Math.max(1, Math.min(fairAmount, available, originalWantAmount - 1));

      if (counterAmount >= 1 && counterAmount < originalWantAmount) {
        events.push(tradeEvent(ctx, proposer, responder, 'trade_countered', giveKind, giveAmount, wantKind, counterAmount));

        // Der urspruengliche Anbieter bewertet die Gegenofferte sofort — er
        // empfaengt jetzt `counterAmount` statt der urspruenglich geforderten
        // Menge, gibt aber weiterhin `giveAmount` her.
        const proposerThreshold = acceptThresholdFor(proposer, responder.id);
        const proposerRatio = ratioOf(counterAmount, wantKind, giveAmount, giveKind);
        if (proposerRatio >= proposerThreshold) {
          accepted = true;
          finalWantAmount = counterAmount;
        }
      }
    }

    if (!accepted) {
      events.push(tradeEvent(ctx, proposer, responder, 'trade_declined', giveKind, giveAmount, wantKind, finalWantAmount));
      return { effects: [], events };
    }

    // Deckungsfaehigkeit gegen den laufenden Rundenstand, nicht gegen den
    // Rundenanfang — dieselbe Buchhaltung wie bei jeder anderen Aktion.
    const responderHas = ctx.projection.agentResource(responder.id, wantKind);
    if (finalWantAmount > responderHas) {
      events.push(tradeEvent(ctx, proposer, responder, 'trade_declined', giveKind, giveAmount, wantKind, finalWantAmount));
      return { effects: [], events };
    }

    const effects: Effect[] = [
      effect.resource(proposer.id, { [giveKind]: -giveAmount, [wantKind]: finalWantAmount }),
      effect.resource(responder.id, { [giveKind]: giveAmount, [wantKind]: -finalWantAmount }),
    ];
    events.push(tradeEvent(ctx, proposer, responder, 'trade_accepted', giveKind, giveAmount, wantKind, finalWantAmount));

    return { effects, events };
  },
};

/**
 * Schwelle, ab welchem Verhaeltnis `wert(empfangen) / wert(hergegeben)` ein
 * Tausch fuer `evaluator` akzeptabel ist. 1.0 ist fair; Gier (Ehrgeiz,
 * Manipulation) hebt die Latte, Empathie und bestehendes Vertrauen in den
 * Gegenueber senken sie.
 */
function acceptThresholdFor(evaluator: Readonly<Agent>, counterpartId: AgentId): number {
  const greed = 0.5 * (evaluator.personality.ambition / 100) + 0.5 * (evaluator.personality.manipulation / 100);
  const generosity = evaluator.personality.empathy / 100;
  const trust = (evaluator.relationships[counterpartId]?.trust ?? 0) / 100;
  return Math.max(0.3, 1.0 + 0.5 * greed - 0.3 * generosity - 0.3 * trust);
}

function ratioOf(receiveAmount: number, receiveKind: ResourceKind, giveAmount: number, giveKind: ResourceKind): number {
  const given = giveAmount * RESOURCE_VALUE[giveKind];
  if (given === 0) return receiveAmount > 0 ? Number.POSITIVE_INFINITY : 0;
  return (receiveAmount * RESOURCE_VALUE[receiveKind]) / given;
}

function tradeEvent(
  ctx: ActionContext,
  proposer: Readonly<Agent>,
  responder: Readonly<Agent>,
  type: 'trade_accepted' | 'trade_countered' | 'trade_declined',
  giveKind: ResourceKind,
  giveAmount: number,
  wantKind: ResourceKind,
  wantAmount: number,
): EventDraft {
  return {
    round: ctx.round,
    type,
    actorId: proposer.id,
    targetId: responder.id,
    locationId: proposer.location,
    payload: { give: { [giveKind]: giveAmount }, want: { [wantKind]: wantAmount } },
    visibility: { scope: 'location', locationId: proposer.location },
    infoRefs: [],
  };
}

function targetsAt(self: AgentId, location: string, ctx: ActionContext) {
  return (Object.keys(ctx.state.agents) as AgentId[])
    .sort()
    .map((id) => ctx.state.agents[id])
    .filter((other) => other && other.alive && other.id !== self && other.location === location)
    .map((other) => other!);
}

function readTarget(params: Record<string, JsonValue>): AgentId | null {
  const value = params['target'];
  return typeof value === 'string' && value.startsWith('agent_') ? (value as AgentId) : null;
}

function readResourceBundle(value: JsonValue | undefined): Partial<Resources> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const bundle: Partial<Resources> = {};
  for (const kind of RESOURCE_KINDS) {
    const amount = (value as Record<string, JsonValue>)[kind];
    if (amount === undefined) continue;
    if (typeof amount !== 'number') return null;
    bundle[kind] = amount;
  }
  return bundle;
}
