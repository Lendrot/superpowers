/**
 * Doc 04 §4.1 Nr. 2 — `rest`.
 *
 * Immer legal. Das ist keine Bequemlichkeit, sondern eine Anforderung: die
 * Validierungskette faellt im Zweifel auf `rest` zurueck (Doc 08 §8.1), also
 * darf `rest` nie ablehnbar sein. Waere es das, koennte eine Runde ohne Aktion
 * enden und die Simulation stillstehen.
 */

import { getAgent } from '../../core/access.js';
import { effect } from '../../mutation/effects.js';
import type { ActionDef } from '../types.js';
import { OK } from '../types.js';

export const restAction: ActionDef = {
  type: 'rest',
  tier: 'routine',
  cost: { energy: 0 },
  cooldown: 0,
  requiresTarget: false,
  allowsStatement: false,

  generate() {
    return [{ type: 'rest', params: {}, label: 'rest' }];
  },

  precondition() {
    return OK;
  },

  resolve(action, ctx) {
    const agent = getAgent(ctx.state, action.actorId);
    const { restEnergyGain, restSatietyCost } = ctx.state.config.economy;

    // Der Effekt traegt die *tatsaechliche* Aenderung, nicht die gewuenschte.
    // Sonst behauptet das Event einen Gewinn von 18, waehrend nur 4 ankamen.
    const energyGain = Math.min(restEnergyGain, 100 - agent.needs.energy);
    const satietyCost = Math.min(restSatietyCost, agent.needs.satiety);

    return {
      effects: [effect.need(agent.id, { energy: energyGain, satiety: -satietyCost })],
      events: [
        {
          round: ctx.round,
          type: 'agent_rested',
          actorId: agent.id,
          locationId: agent.location,
          payload: { energyGain, satietyCost },
          visibility: { scope: 'location', locationId: agent.location },
          infoRefs: [],
        },
      ],
    };
  },
};
