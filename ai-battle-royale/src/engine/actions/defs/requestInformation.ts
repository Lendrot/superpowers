/**
 * Doc 04 §4.1 Nr. 7 — `request_information`.
 *
 * Der Fragende behauptet nichts — `allowsStatement: false`. Die eigentliche
 * Aussage entsteht INLINE beim Ziel, waehrend `resolve` laeuft (Doc 04 §4.1:
 * "Ziel antwortet mit einem legalen Statement, inkl. `refuse_to_answer`") und
 * verbraucht dessen Rundenzug nicht (Doc 04 §4.1, Ergaenzende Nicht-Aktionen).
 *
 * Zwei Verteidigungslinien wie ueberall (Doc 08 §8.2.4), nur beide hier statt
 * verteilt: `chooseResponse` konstruiert nur, was der Wissensstand des Ziels
 * hergibt (erste Linie) — und `validateStatement` prueft trotzdem nach
 * (zweite Linie), falls sich `chooseResponse` irgendwo irrt. Der Fallback ist
 * `express_uncertainty`, das R9 immer erlaubt.
 *
 * `infoRefs` bleibt aus demselben Grund wie bei `share_information` leer:
 * sonst wuerde Phase 2 die Weltwahrheit an alle Anwesenden verteilen, nicht
 * nur die Aussage an den Fragenden.
 */

import { getAgent } from '../../core/access.js';
import { eventId } from '../../core/ids.js';
import type { Agent, AgentId, Effect, InfoId, InfoItem, JsonValue, Statement } from '../../core/types.js';
import type { Precision } from '../../information/disclosurePolicy.js';
import { deriveToldEntry, statementFor } from '../../information/disclosurePolicy.js';
import { isRefusal } from '../../information/statements.js';
import { statementRecordFor } from '../../information/statementLog.js';
import { effectiveCertainty } from '../../information/knowledge.js';
import { stockInfoId } from '../../information/infoRegistry.js';
import { effect } from '../../mutation/effects.js';
import { validateStatement } from '../../validation/truthValidator.js';
import type { TruthContext } from '../../validation/truthValidator.js';
import type { ActionCandidate, ActionContext, ActionDef } from '../types.js';
import { OK, reject } from '../types.js';
import { LOCATION_IDS } from '../../world/locations.js';

export const requestInformationAction: ActionDef = {
  type: 'request_information',
  tier: 'social',
  cost: { energy: 0 }, // [ANNAHME], wie bei share_information
  cooldown: 0,
  requiresTarget: true,
  allowsStatement: false,

  generate(agent, ctx): ActionCandidate[] {
    const targets = targetsAt(agent.id, agent.location, ctx);
    if (targets.length === 0) return [];

    // Ueber welchen anderen Ort weiss der Agent am wenigsten? Fragen lohnt
    // sich dort am meisten. Nur `food`, um die Kandidatenzahl klein zu
    // halten — dieselbe Vereinfachung, die `policyProvider.ts#scoreMove` bei
    // der Ortswahl schon trifft.
    let worstLocation: (typeof LOCATION_IDS)[number] | null = null;
    let worstCertainty = 1;
    for (const locationId of LOCATION_IDS) {
      if (locationId === agent.location) continue;
      const infoId = stockInfoId(locationId, 'food');
      const entry = agent.knowledge[infoId];
      const item = ctx.state.infoRegistry[infoId];
      const certainty = entry && item ? effectiveCertainty(entry, item, ctx.round, ctx.state.config.info) : 0;
      if (worstLocation === null || certainty < worstCertainty) {
        worstLocation = locationId;
        worstCertainty = certainty;
      }
    }
    if (worstLocation === null || worstCertainty >= ctx.state.config.info.assertCertaintyThreshold) {
      return [];
    }

    const infoId = stockInfoId(worstLocation, 'food');
    return targets.map((target) => ({
      type: 'request_information' as const,
      params: { target: target.id, infoId },
      label: `request_information:${target.id}:${infoId}`,
    }));
  },

  precondition(action, ctx) {
    const agent = getAgent(ctx.state, action.actorId);
    const targetId = readTarget(action.params);
    const infoId = readInfoId(action.params);
    if (!targetId || !infoId) {
      return reject(
        'schema_invalid',
        `request_information ohne gueltige Parameter target/infoId: ${JSON.stringify(action.params)}`,
      );
    }
    if (targetId === agent.id) {
      return reject('target_invalid', 'Ein Agent kann sich nicht selbst fragen');
    }
    const target = ctx.state.agents[targetId];
    if (!target) return reject('target_invalid', `Agent ${targetId} existiert nicht`);
    if (!target.alive) return reject('target_invalid', `Agent ${targetId} ist ausgeschieden`);
    if (target.location !== agent.location) {
      return reject('target_invalid', `Agent ${targetId} ist nicht am selben Ort`);
    }
    if (!ctx.state.infoRegistry[infoId]) {
      return reject('unknown_reference', `Info ${infoId} existiert nicht`);
    }

    return OK;
  },

  resolve(action, ctx) {
    const asker = getAgent(ctx.state, action.actorId);
    const targetId = readTarget(action.params);
    const infoId = readInfoId(action.params);
    if (!targetId || !infoId) {
      throw new Error('request_information ohne Parameter in resolve — Validierung uebersprungen?');
    }
    const target = getAgent(ctx.state, targetId);
    const item = ctx.state.infoRegistry[infoId];
    if (!item) throw new Error(`request_information: ${infoId} fehlt in der Registry — Validierung uebersprungen?`);

    const candidate = chooseResponse(target, infoId, item, ctx);
    const truthCtx: TruthContext = {
      round: ctx.round,
      config: ctx.state.config,
      statementLog: ctx.state.statementLog,
      infoRegistry: ctx.state.infoRegistry,
    };
    const verdict = validateStatement(candidate, target, truthCtx);
    const finalStatement: Statement = verdict.ok ? candidate : { kind: 'express_uncertainty', topic: item.topic };

    const effects: Effect[] = [];
    const thisEventId = eventId(ctx.round, ctx.log.nextSeq);

    if (isRefusal(finalStatement)) {
      return {
        effects,
        events: [
          {
            round: ctx.round,
            type: 'information_refused',
            actorId: target.id,
            targetId: asker.id,
            locationId: target.location,
            payload: { infoId, kind: finalStatement.kind },
            visibility: { scope: 'participants' },
            infoRefs: [],
          },
        ],
      };
    }

    // Nur erreichbar, wenn `chooseResponse` eine informative Aussage
    // konstruiert hat — und das tut sie nur, wenn `target.knowledge[infoId]`
    // existiert (siehe dort).
    const targetEntry = target.knowledge[infoId]!;

    const newEntry = deriveToldEntry({
      statement: finalStatement,
      senderEntry: targetEntry,
      item,
      round: ctx.round,
      config: ctx.state.config,
      sourceAgent: target.id,
      sourceEventId: thisEventId,
      existing: asker.knowledge[infoId],
    });
    if (newEntry) effects.push(effect.knowledge(asker.id, newEntry));

    // Die Antwort ist DES ZIELS Aussage, nicht die des Fragenden — die
    // zentrale Anbindung in `runRound.ts` sieht nur `action.statement` der
    // obersten Aktion (hier `undefined`, siehe `allowsStatement: false`) und
    // wuerde diese Aussage nie ins R7-Gedaechtnis aufnehmen.
    const record = statementRecordFor(finalStatement, targetEntry, ctx.round);
    if (record) effects.push(effect.statement(target.id, record));

    return {
      effects,
      events: [
        {
          round: ctx.round,
          type: 'information_shared',
          actorId: target.id,
          targetId: asker.id,
          locationId: target.location,
          payload: { infoId, kind: finalStatement.kind },
          visibility: { scope: 'location', locationId: target.location },
          infoRefs: [],
        },
      ],
    };
  },
};

/**
 * Erste Verteidigungslinie: was wuerde DIESES Ziel aus SEINEM eigenen Wissen
 * heraus antworten? `honesty` steuert laut Doc 03 §3.2.1 die Offenlegungsneigung
 * — hohe Werte bevorzugen `assert_fact` mit hoher Praezision, niedrige `withhold`.
 * Ob ueberhaupt geantwortet wird, ist eine Charakterfrage, kein Kalkuel — anders
 * als bei `trade` (siehe dort) geht diese Entscheidung deshalb durch einen Wurf.
 */
function chooseResponse(
  target: Readonly<Agent>,
  infoId: InfoId,
  item: Readonly<InfoItem>,
  ctx: ActionContext,
): Statement {
  const entry = target.knowledge[infoId];
  if (!entry) return { kind: 'express_uncertainty', topic: item.topic };

  const honesty = target.personality.honesty / 100;
  const roll = ctx.rng.derive('disclose', ctx.round, target.id, infoId).float();
  const refusalChance = 0.6 * (1 - honesty);
  if (roll < refusalChance) {
    // `withhold` statt `refuse_to_answer`: Doc 03 §3.2.1 nennt genau diese
    // Form als Ausdruck niedriger `honesty` — schweigen, ohne es zu benennen.
    return { kind: 'withhold', topic: item.topic };
  }

  return statementFor(entry, item, ctx.round, ctx.state.config, precisionFor(honesty));
}

function precisionFor(honesty: number): Precision {
  if (honesty >= 0.75) return 'exact';
  if (honesty >= 0.5) return 'bound';
  if (honesty >= 0.25) return 'qualitative';
  return 'existence_only';
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

function readInfoId(params: Record<string, JsonValue>): InfoId | null {
  const value = params['infoId'];
  return typeof value === 'string' && value.startsWith('info_') ? (value as InfoId) : null;
}
