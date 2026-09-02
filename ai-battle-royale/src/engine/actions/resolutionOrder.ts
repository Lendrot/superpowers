/**
 * Doc 04 §4.3 — deterministische Auflösungsreihenfolge.
 *
 * Zuerst die feste Klassenreihenfolge (Ortswechsel vor allem Ortsabhaengigen),
 * innerhalb einer Klasse nach `(initiative desc, agentId asc)`. Der Tie-Break
 * ueber die AgentId ist der Grund, warum IDs sortierbar sein muessen (Doc 03 §3.0).
 */

import { getAgent } from '../core/access.js';
import type { RngBundle } from '../core/rng.js';
import type { ActionType, AgentAction, Round, WorldState } from '../core/types.js';

/** Kleinere Klasse wird zuerst aufgeloest. */
const ACTION_CLASS: Record<ActionType, number> = {
  move: 1,
  rest: 2,
  consume: 2,
  gather_resource: 3,
  trade: 4,
  help: 4,
  share_information: 5,
  request_information: 5,
  investigate: 5,
  offer_alliance: 6,
  leave_alliance: 6,
  expel_member: 6,
  confront: 7,
};

export interface OrderedAction {
  action: AgentAction;
  initiative: number;
}

/**
 * `initiative` aus Dominanz, Energie und einem Wurf — deterministisch, weil der
 * Stream die Runde und die AgentId enthaelt.
 */
export function initiativeOf(
  state: Readonly<WorldState>,
  actorId: AgentAction['actorId'],
  round: Round,
  rng: RngBundle,
): number {
  const agent = getAgent(state, actorId);
  const roll = rng.derive('initiative', round, actorId).float();
  return 0.5 * (agent.personality.dominance / 100) + 0.3 * (agent.needs.energy / 100) + 0.2 * roll;
}

export function orderActions(
  actions: readonly AgentAction[],
  state: Readonly<WorldState>,
  round: Round,
  rng: RngBundle,
): OrderedAction[] {
  return actions
    .map((action) => ({ action, initiative: initiativeOf(state, action.actorId, round, rng) }))
    .sort((a, b) => {
      const classDiff = ACTION_CLASS[a.action.type] - ACTION_CLASS[b.action.type];
      if (classDiff !== 0) return classDiff;
      if (a.initiative !== b.initiative) return b.initiative - a.initiative;
      return a.action.actorId < b.action.actorId ? -1 : a.action.actorId > b.action.actorId ? 1 : 0;
    });
}

export function actionClassOf(type: ActionType): number {
  return ACTION_CLASS[type];
}
