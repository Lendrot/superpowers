/**
 * Doc 04 §4.1 Nr. 4 — `consume`.
 *
 * Vorbedingung: `food >= 1`. Effekt: −food, +satiety.
 *
 * Das ist die Senke, die dem Sammeln erst einen Zweck gibt: bis hierher wuchs
 * der Vorrat einzelner Agenten unbegrenzt, weil Nahrung nirgends verbraucht
 * wurde.
 */

import { getAgent } from '../../core/access.js';
import { effect } from '../../mutation/effects.js';
import type { ActionDef } from '../types.js';
import { OK, reject } from '../types.js';

export const consumeAction: ActionDef = {
  type: 'consume',
  tier: 'routine',
  cost: { energy: 0 },
  cooldown: 0,
  requiresTarget: false,
  allowsStatement: false,

  generate(agent, ctx) {
    const need = ctx.state.config.economy.foodPerRound;
    if (agent.resources.food < need) return [];
    // Bei voller Saettigung waere Essen nur Verschwendung — der Kandidat
    // entstuende zwar legal, aber der Generator soll nur anbieten, was auch
    // sinnvoll ausfuehrbar ist.
    if (agent.needs.satiety >= 100) return [];

    return [{ type: 'consume' as const, params: {}, label: 'consume' }];
  },

  precondition(action, ctx) {
    const agent = getAgent(ctx.state, action.actorId);
    const need = ctx.state.config.economy.foodPerRound;
    if (agent.resources.food < need) {
      return reject('insufficient_resources', `food ${agent.resources.food} < ${need}`);
    }
    return OK;
  },

  resolve(action, ctx) {
    const agent = getAgent(ctx.state, action.actorId);
    const { foodPerRound, satietyPerFood } = ctx.state.config.economy;
    const satietyGain = Math.min(satietyPerFood, 100 - agent.needs.satiety);

    return {
      effects: [
        effect.resource(agent.id, { food: -foodPerRound }),
        effect.need(agent.id, { satiety: satietyGain }),
      ],
      events: [
        {
          round: ctx.round,
          type: 'food_consumed',
          actorId: agent.id,
          locationId: agent.location,
          payload: { food: foodPerRound, satietyGain },
          visibility: { scope: 'location', locationId: agent.location },
          infoRefs: [],
        },
      ],
    };
  },
};
