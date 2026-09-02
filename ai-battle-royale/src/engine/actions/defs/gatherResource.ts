/**
 * Doc 04 §4.1 Nr. 1 — `gather_resource`.
 *
 * Vorbedingung: `energy >= 10` und der Ort hat Bestand. Ertrag ist
 * `gatherBase × f(energie, rng)`, gedeckelt durch den noch freien Bestand.
 *
 * Die Ernte ist eine **Verschiebung**, keine Quelle: derselbe Betrag verlaesst
 * den Ort, der beim Agenten ankommt. Nur `regen` (Phase 1) erzeugt neuen
 * Bestand. Damit bleibt die Erhaltungsregel aus Doc 03 §3.1 pruefbar.
 */

import { getAgent, getLocation } from '../../core/access.js';
import { RESOURCE_KINDS } from '../../core/resources.js';
import type { JsonValue, ResourceKind } from '../../core/types.js';
import { effect } from '../../mutation/effects.js';
import type { ActionContext, ActionDef, ActionCandidate } from '../types.js';
import { OK, reject } from '../types.js';

export const gatherResourceAction: ActionDef = {
  type: 'gather_resource',
  tier: 'routine',
  cost: { energy: 0 }, // tatsaechliche Kosten stehen in config.economy.gatherEnergyCost
  cooldown: 0,
  requiresTarget: false,
  allowsStatement: false,

  generate(agent, ctx): ActionCandidate[] {
    if (agent.needs.energy < ctx.state.config.economy.gatherEnergyCost) return [];
    const location = getLocation(ctx.state, agent.location);

    return RESOURCE_KINDS.filter((kind) => location.stock[kind] > 0).map((kind) => ({
      type: 'gather_resource' as const,
      params: { resource: kind },
      label: `gather_resource:${kind}`,
    }));
  },

  precondition(action, ctx) {
    const agent = getAgent(ctx.state, action.actorId);
    const kind = readResourceParam(action.params);
    if (!kind) {
      return reject('schema_invalid', `gather_resource ohne gueltigen Parameter resource: ${JSON.stringify(action.params)}`);
    }

    const cost = ctx.state.config.economy.gatherEnergyCost;
    if (agent.needs.energy < cost) {
      return reject('precondition_failed', `energy ${agent.needs.energy} < ${cost}`);
    }

    const location = getLocation(ctx.state, agent.location);
    if (location.stock[kind] <= 0) {
      return reject('precondition_failed', `${location.id} hat keinen Bestand an ${kind}`);
    }

    return OK;
  },

  resolve(action, ctx) {
    const agent = getAgent(ctx.state, action.actorId);
    const kind = readResourceParam(action.params);
    if (!kind) {
      throw new Error('gather_resource ohne Parameter resource in resolve — Validierung uebersprungen?');
    }

    const location = getLocation(ctx.state, agent.location);
    const free = ctx.ledger.available(location.id, kind);
    const energyCost = Math.min(ctx.state.config.economy.gatherEnergyCost, agent.needs.energy);

    if (free <= 0) {
      // First-come-first-served (Doc 04 §4.3): wer spaeter dran ist, findet
      // nichts mehr vor.
      //
      // Design-Entscheidung, nicht aus der Spec: der Versuch kostet trotzdem
      // Energie. Waere er gratis, koennte ein Agent in jeder Runde kostenlos
      // nachsehen — gemessen wurden so 8 625 Fehlversuche auf 11 477 Ernten in
      // 400 Runden, also ein Leerlauf, der das Log dominiert und die Knappheit
      // folgenlos macht. Mit Energiekosten reguliert sich der Andrang selbst.
      return {
        effects: [effect.need(agent.id, { energy: -energyCost })],
        events: [
          {
            round: ctx.round,
            type: 'gather_failed',
            actorId: agent.id,
            locationId: location.id,
            payload: { resource: kind, reason: 'stock_depleted', energyCost },
            // Am Ort sichtbar: die Anwesenden sehen jemanden leer zurueckkommen.
            visibility: { scope: 'location', locationId: location.id },
            infoRefs: [],
          },
        ],
      };
    }

    const amount = Math.min(free, rollYield(agent.needs.energy, ctx, action.actorId));
    ctx.ledger.reserve(location.id, kind, amount);

    return {
      effects: [
        effect.locationStock(location.id, { [kind]: -amount }, 'transfer'),
        effect.resource(agent.id, { [kind]: amount }),
        effect.need(agent.id, { energy: -energyCost }),
      ],
      events: [
        {
          round: ctx.round,
          type: 'resource_gathered',
          actorId: agent.id,
          locationId: location.id,
          payload: { resource: kind, amount, energyCost },
          // Ernten ist am Ort sichtbar — daraus entsteht ab T11 das Wissen
          // `stock_at_location` fuer die Anwesenden.
          visibility: { scope: 'location', locationId: location.id },
          infoRefs: [],
        },
      ],
    };
  },
};

/**
 * Ertrag: Basis, moduliert durch Energie (0.6–1.4) und einen Wurf (0.75–1.25).
 * Mindestens 1 — eine Ernte, die nichts einbringt, waere nur Energieverlust.
 * Die Faktoren sind **[ANNAHME]** und Kalibrierungsmasse (T43).
 */
function rollYield(energy: number, ctx: ActionContext, actorId: string): number {
  const roll = ctx.rng.derive('gather', ctx.round, actorId).float();
  const energyFactor = 0.6 + 0.8 * (energy / 100);
  const raw = ctx.state.config.economy.gatherBase * energyFactor * (0.75 + 0.5 * roll);
  return Math.max(1, Math.round(raw));
}

function readResourceParam(params: Record<string, JsonValue>): ResourceKind | null {
  const value = params['resource'];
  return RESOURCE_KINDS.find((kind) => kind === value) ?? null;
}
