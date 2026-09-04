/**
 * Doc 04 §4.1 Nr. 9 — `leave_alliance`.
 *
 * Kein Ziel (Doc 04 §4.1: "Ziel: –") — anders als `expel_member` trifft diese
 * Entscheidung niemand fuer den Agenten. `exitPenalty` (Energie) ist der
 * Preis des Austritts; "harte Trust-Deltas bei Ex-Mitgliedern" laufen ueber
 * ein eigenes `alliance_left`-Event PRO verbleibendem Mitglied — dieselbe
 * Notwendigkeit wie bei `attack`s Ein-Ereignis-pro-Kampf: die
 * `RELATIONSHIP_DELTA_TABLE` (Phase 8) kennt nur `actorId`/`targetId`, kein
 * n-zu-eins.
 *
 * Live gegen die `EffectProjection` geprueft: `leave_alliance` ist Klasse 6,
 * und wer in DIESER Runde bereits (von einer frueher aufgeloesten
 * `expel_member`-Aktion) ausgeschlossen wurde, ist beim Aufloesen der eigenen
 * `leave_alliance` schon draussen — kein zweiter Austritt aus einer Allianz,
 * der er gar nicht mehr angehoert.
 */

import { getAgent } from '../../core/access.js';
import type { AgentId } from '../../core/types.js';
import { effect } from '../../mutation/effects.js';
import type { ActionCandidate, ActionDef } from '../types.js';
import { OK, reject } from '../types.js';

export const leaveAllianceAction: ActionDef = {
  type: 'leave_alliance',
  tier: 'strategic',
  cost: { energy: 0 }, // tatsaechliche Kosten: config.alliance.exitPenalty
  cooldown: 0,
  requiresTarget: false,
  allowsStatement: true, // Doc 04 §4.1: "ja" — hier ungenutzt, siehe T21 (Pledges)

  generate(agent, ctx): ActionCandidate[] {
    if (ctx.projection.allianceOf(agent.id) === null) return [];
    return [{ type: 'leave_alliance' as const, params: {}, label: 'leave_alliance' }];
  },

  precondition(action, ctx) {
    const agent = getAgent(ctx.state, action.actorId);
    if (ctx.projection.allianceOf(agent.id) === null) {
      return reject('precondition_failed', `${agent.id} ist in keiner Allianz`);
    }
    return OK;
  },

  resolve(action, ctx) {
    const agent = getAgent(ctx.state, action.actorId);
    const allianceId = ctx.projection.allianceOf(agent.id);
    // Live-Nachpruefung (siehe Kopfkommentar): eine fruehere Aktion derselben
    // Klasse hat den Austritt bereits erledigt (Ausschluss) — dann ist nichts
    // mehr zu tun.
    if (allianceId === null) return { effects: [], events: [] };

    const remainingMembers = ctx.projection
      .allianceMembers(allianceId)
      .filter((id) => id !== agent.id);

    const effects = [
      effect.allianceLeave(allianceId, agent.id),
      effect.need(agent.id, { energy: -ctx.state.config.alliance.exitPenalty }),
    ];

    const events = remainingMembers.map((memberId: AgentId) => ({
      round: ctx.round,
      type: 'alliance_left' as const,
      actorId: agent.id,
      targetId: memberId,
      allianceId,
      locationId: agent.location,
      payload: {},
      // 'participants' statt 'location': die verbleibenden Mitglieder muessen
      // das erfahren, unabhaengig davon, wo sie gerade stehen — dieselbe
      // Begruendung wie bei `request_information`s Inline-Antwort.
      visibility: { scope: 'participants' as const },
      infoRefs: [],
    }));

    return { effects, events };
  },
};
