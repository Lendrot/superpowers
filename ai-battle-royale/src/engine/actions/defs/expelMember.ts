/**
 * Doc 04 §4.1 Nr. 10 — `expel_member`.
 *
 * Nur der Leader darf, und nie sich selbst (dafuer gibt es `leave_alliance`).
 * `Agent.status.exiledFrom` (T02, seit T20 endlich befuellt) zaehlt den
 * Ausschluss mit — die Zaehlung selbst ist Buchhaltung des `StateMutator`
 * (siehe dort), nicht dieser Aktion.
 *
 * **Bekannte Vereinfachung dieses Tages:** "ist Leader" wird gegen
 * `state.alliances[id].leaderId` geprueft, den Stand vom Rundenbeginn — nicht
 * live nachgefuehrt, falls eine fruehere Aktion derselben Klasse (6) in
 * DIESER Runde die Fuehrung bereits verschoben hat (`leave_alliance` eines
 * gehenden Leaders reicht sie automatisch weiter, siehe `stateMutator.ts`).
 * Mitgliedschaft selbst — "ist das Ziel noch Mitglied?" — prueft dagegen live
 * gegen die `EffectProjection`, aus demselben Grund wie bei
 * `leave_alliance`: eine Doppel-Ausschliessung im selben Batch waere sonst
 * ein Effekt auf ein Ziel, das der `StateMutator` zu Recht ablehnt.
 */

import { getAgent } from '../../core/access.js';
import type { AgentId, JsonValue } from '../../core/types.js';
import { effect } from '../../mutation/effects.js';
import type { ActionCandidate, ActionDef } from '../types.js';
import { OK, reject } from '../types.js';

export const expelMemberAction: ActionDef = {
  type: 'expel_member',
  tier: 'strategic',
  cost: { energy: 0 },
  cooldown: 0,
  requiresTarget: true,
  allowsStatement: true, // Doc 04 §4.1: "ja" — hier ungenutzt, siehe T21 (Pledges)

  generate(agent, ctx): ActionCandidate[] {
    const allianceId = ctx.projection.allianceOf(agent.id);
    if (allianceId === null) return [];
    const alliance = ctx.state.alliances[allianceId];
    if (!alliance || alliance.leaderId !== agent.id) return [];

    return ctx.projection
      .allianceMembers(allianceId)
      .filter((id) => id !== agent.id)
      .map((targetId) => ({
        type: 'expel_member' as const,
        params: { target: targetId },
        label: `expel_member:${targetId}`,
      }));
  },

  precondition(action, ctx) {
    const agent = getAgent(ctx.state, action.actorId);
    const targetId = readTarget(action.params);
    if (!targetId) {
      return reject('schema_invalid', `expel_member ohne gueltigen Parameter target: ${JSON.stringify(action.params)}`);
    }
    if (targetId === agent.id) {
      return reject('target_invalid', 'Der Leader kann sich nicht selbst ausschliessen (siehe leave_alliance)');
    }
    if (!ctx.state.agents[targetId]) {
      return reject('target_invalid', `Agent ${targetId} existiert nicht`);
    }

    const allianceId = ctx.projection.allianceOf(agent.id);
    if (allianceId === null) {
      return reject('precondition_failed', `${agent.id} fuehrt keine Allianz`);
    }
    const alliance = ctx.state.alliances[allianceId];
    if (!alliance || alliance.leaderId !== agent.id) {
      return reject('precondition_failed', `${agent.id} ist nicht Leader von ${allianceId}`);
    }
    if (!ctx.projection.allianceMembers(allianceId).includes(targetId)) {
      return reject('target_invalid', `${targetId} ist nicht Mitglied von ${allianceId}`);
    }

    return OK;
  },

  resolve(action, ctx) {
    const leader = getAgent(ctx.state, action.actorId);
    const targetId = readTarget(action.params);
    if (!targetId) throw new Error('expel_member ohne Parameter target in resolve — Validierung uebersprungen?');

    const allianceId = ctx.projection.allianceOf(leader.id);
    const alliance = allianceId ? ctx.state.alliances[allianceId] : undefined;
    const stillEligible =
      allianceId !== null &&
      alliance?.leaderId === leader.id &&
      ctx.projection.allianceMembers(allianceId).includes(targetId);

    // Live-Nachpruefung (siehe Kopfkommentar): das Ziel ist in dieser Runde
    // bereits ausgeschieden (Austritt oder frueherer Ausschluss) — dann ist
    // nichts mehr zu tun.
    if (!stillEligible) return { effects: [], events: [] };

    return {
      effects: [effect.allianceExpel(allianceId!, targetId)],
      events: [
        {
          round: ctx.round,
          type: 'alliance_expelled',
          actorId: leader.id,
          targetId,
          allianceId: allianceId!,
          locationId: leader.location,
          payload: {},
          // 'participants': der Ausgeschlossene muss es erfahren, unabhaengig
          // davon, wo er gerade steht — dieselbe Begruendung wie bei
          // `leave_alliance`.
          visibility: { scope: 'participants' },
          infoRefs: [],
        },
      ],
    };
  },
};

function readTarget(params: Record<string, JsonValue>): AgentId | null {
  const value = params['target'];
  return typeof value === 'string' && value.startsWith('agent_') ? (value as AgentId) : null;
}
