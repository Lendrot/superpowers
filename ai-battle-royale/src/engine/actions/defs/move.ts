/**
 * Doc 04 §4.1 Nr. 3 — `move`.
 *
 * Vorbedingung: Ziel ist Nachbar, `energy >= 5`. Der Ortswechsel ist die
 * einzige Art, wie ein Agent seine Informationslage aendert: er bestimmt, wer
 * was beobachtet (Phase 2) — und was er ab jetzt nicht mehr mitbekommt.
 *
 * `move` wird in Klasse 1 aufgeloest, also vor allem Ortsabhaengigen
 * (Doc 04 §4.3). Wer wegzieht, erntet in derselben Runde am neuen Ort.
 */

import { getAgent, getLocation } from '../../core/access.js';
import type { JsonValue, LocationId } from '../../core/types.js';
import { effect } from '../../mutation/effects.js';
import type { ActionCandidate, ActionDef } from '../types.js';
import { OK, reject } from '../types.js';

export const moveAction: ActionDef = {
  type: 'move',
  tier: 'routine',
  cost: { energy: 0 }, // tatsaechliche Kosten: config.economy.moveEnergyCost
  cooldown: 0,
  requiresTarget: false,
  allowsStatement: false,

  generate(agent, ctx): ActionCandidate[] {
    if (agent.needs.energy < ctx.state.config.economy.moveEnergyCost) return [];
    const here = getLocation(ctx.state, agent.location);

    return here.neighbors.map((to) => ({
      type: 'move' as const,
      params: { to },
      label: `move:${to}`,
    }));
  },

  precondition(action, ctx) {
    const agent = getAgent(ctx.state, action.actorId);
    const to = readLocationParam(action.params, ctx.state.locations);
    if (!to) {
      return reject('schema_invalid', `move ohne gueltigen Parameter to: ${JSON.stringify(action.params)}`);
    }

    const cost = ctx.state.config.economy.moveEnergyCost;
    if (agent.needs.energy < cost) {
      return reject('precondition_failed', `energy ${agent.needs.energy} < ${cost}`);
    }

    const here = getLocation(ctx.state, agent.location);
    if (!here.neighbors.includes(to)) {
      return reject('precondition_failed', `${to} ist kein Nachbar von ${here.id}`);
    }

    return OK;
  },

  resolve(action, ctx) {
    const agent = getAgent(ctx.state, action.actorId);
    const to = readLocationParam(action.params, ctx.state.locations);
    if (!to) {
      throw new Error('move ohne Parameter to in resolve — Validierung uebersprungen?');
    }

    const from = agent.location;
    const energyCost = Math.min(ctx.state.config.economy.moveEnergyCost, agent.needs.energy);

    return {
      effects: [effect.move(agent.id, to), effect.need(agent.id, { energy: -energyCost })],
      events: [
        {
          round: ctx.round,
          type: 'agent_moved',
          actorId: agent.id,
          locationId: to,
          payload: { from, to, energyCost },
          // Sichtbar am Zielort: dort steht er ab jetzt. Wer am Herkunftsort
          // bleibt, merkt nur, dass jemand fehlt — das ist keine Information,
          // die sich als Wissenseintrag festhalten liesse.
          visibility: { scope: 'location', locationId: to },
          infoRefs: [],
        },
      ],
    };
  },
};

function readLocationParam(
  params: Record<string, JsonValue>,
  locations: Readonly<Record<string, unknown>>,
): LocationId | null {
  const value = params['to'];
  return typeof value === 'string' && value in locations ? (value as LocationId) : null;
}
