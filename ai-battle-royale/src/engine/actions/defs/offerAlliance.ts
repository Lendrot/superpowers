/**
 * Doc 04 §4.1 Nr. 8 — `offer_alliance`.
 *
 * "Nicht in Allianz ODER Leader mit freiem Platz" (Doc 04 §4.1): ein Agent
 * ohne eigene Allianz gruendet mit dem ersten Beitritt eine neue, ein Leader
 * mit freiem Platz laedt in seine bestehende ein. Es gibt keinen dritten Weg
 * — ein einfaches Mitglied kann niemanden einladen (das waere Machtausuebung
 * ohne Mandat), und `join_alliance` existiert bewusst nicht als eigene
 * Aktion (Doc 04 §4.2): Beitritt ist immer die Reaktion HIER, nie ein
 * einseitiger Schritt des Beitretenden.
 *
 * "Ziel entscheidet inline" — wie bei `trade`/`request_information` entsteht
 * die Reaktion synchron in `resolve`, ohne den Rundenzug des Ziels zu
 * verbrauchen, und ohne Wurf: eine Allianzentscheidung ist eine Bewertung
 * (Vertrauen, Persoenlichkeit), kein Gluecksspiel — dieselbe Begruendung wie
 * bei `trade`s Kauf-Entscheidung.
 *
 * Live gegen die `EffectProjection` geprueft, nicht gegen den Rundenanfang:
 * `offer_alliance` ist Klasse 6, und zwei Aktionen dieser Klasse koennen in
 * derselben Runde dieselbe Allianz oder denselben Zielagenten treffen (ein
 * Leader ladet zwei Leute in derselben Runde ein, oder das Ziel wird
 * anderswo in dieser Runde schon Mitglied). Ohne den Live-Check wuerden beide
 * Angebote nach dem Stand vom Rundenbeginn bewertet und koennten sich
 * widersprechen, sobald der StateMutator sie nacheinander anwendet.
 */

import { getAgent } from '../../core/access.js';
import { allianceId as makeAllianceId } from '../../core/ids.js';
import type { Agent, AgentId, JsonValue } from '../../core/types.js';
import { effect } from '../../mutation/effects.js';
import type { ActionCandidate, ActionContext, ActionDef } from '../types.js';
import { OK, reject } from '../types.js';

/** Ab diesem Score (0..~1) nimmt das Ziel an. **[ANNAHME]**. */
const ACCEPT_THRESHOLD = 0.5;

export const offerAllianceAction: ActionDef = {
  type: 'offer_alliance',
  tier: 'strategic',
  cost: { energy: 0 }, // [ANNAHME], wie trade/share_information
  cooldown: 0,
  requiresTarget: true,
  allowsStatement: true, // Doc 04 §4.1: "ja" — hier ungenutzt, siehe T21 (Pledges)

  generate(agent, ctx): ActionCandidate[] {
    if (!canProposeFrom(agent, ctx)) return [];

    return targetsAt(agent.id, agent.location, ctx)
      .filter((target) => ctx.projection.allianceOf(target.id) === null)
      .map((target) => ({
        type: 'offer_alliance' as const,
        params: { target: target.id },
        label: `offer_alliance:${target.id}`,
      }));
  },

  precondition(action, ctx) {
    const agent = getAgent(ctx.state, action.actorId);
    const targetId = readTarget(action.params);
    if (!targetId) {
      return reject('schema_invalid', `offer_alliance ohne gueltigen Parameter target: ${JSON.stringify(action.params)}`);
    }
    if (targetId === agent.id) {
      return reject('target_invalid', 'Ein Agent kann sich nicht selbst einladen');
    }
    const target = ctx.state.agents[targetId];
    if (!target) return reject('target_invalid', `Agent ${targetId} existiert nicht`);
    if (!target.alive) return reject('target_invalid', `Agent ${targetId} ist ausgeschieden`);
    if (target.location !== agent.location) {
      return reject('target_invalid', `Agent ${targetId} ist nicht am selben Ort`);
    }
    if (ctx.projection.allianceOf(target.id) !== null) {
      return reject('target_invalid', `Agent ${targetId} ist bereits in einer Allianz`);
    }
    if (!canProposeFrom(agent, ctx)) {
      return reject(
        'precondition_failed',
        `${agent.id} ist weder allianzlos noch Leader mit freiem Platz`,
      );
    }

    return OK;
  },

  resolve(action, ctx) {
    const proposer = getAgent(ctx.state, action.actorId);
    const targetId = readTarget(action.params);
    if (!targetId) throw new Error('offer_alliance ohne Parameter target in resolve — Validierung uebersprungen?');
    const target = getAgent(ctx.state, targetId);

    // Live erneut geprueft (siehe Kopfkommentar): zwischen Precondition (vor
    // Phase 6) und dieser Aufloesung koennen fruehere Aktionen derselben
    // Klasse den Anspruch bereits entwertet haben.
    const eligible = ctx.projection.allianceOf(target.id) === null && canProposeFrom(proposer, ctx);
    const accepted = eligible && acceptanceScoreFor(target, proposer.id) >= ACCEPT_THRESHOLD;

    if (!accepted) {
      return {
        effects: [],
        events: [
          {
            round: ctx.round,
            type: 'alliance_offer_declined',
            actorId: proposer.id,
            targetId: target.id,
            locationId: proposer.location,
            payload: {},
            visibility: { scope: 'location', locationId: proposer.location },
            infoRefs: [],
          },
        ],
      };
    }

    const proposerAllianceId = ctx.projection.allianceOf(proposer.id);
    const joinedAllianceId = proposerAllianceId ?? makeAllianceId(ctx.round, ctx.log.nextSeq);
    const effects = proposerAllianceId
      ? [effect.allianceJoin(proposerAllianceId, target.id)]
      : [effect.allianceCreate(joinedAllianceId, `${proposer.name}s Allianz`, proposer.id, target.id)];

    return {
      effects,
      events: [
        {
          round: ctx.round,
          type: 'alliance_offer_accepted',
          actorId: proposer.id,
          targetId: target.id,
          allianceId: joinedAllianceId,
          locationId: proposer.location,
          payload: {},
          visibility: { scope: 'location', locationId: proposer.location },
          infoRefs: [],
        },
      ],
    };
  },
};

/** "Nicht in Allianz ODER Leader mit freiem Platz" (Doc 04 §4.1 Nr. 8), live geprueft. */
function canProposeFrom(agent: Readonly<Agent>, ctx: ActionContext): boolean {
  const allianceId = ctx.projection.allianceOf(agent.id);
  if (allianceId === null) return true;
  const alliance = ctx.state.alliances[allianceId];
  if (!alliance || alliance.leaderId !== agent.id) return false;
  const aliveMembers = ctx.projection
    .allianceMembers(allianceId)
    .filter((id) => ctx.state.agents[id]?.alive).length;
  return aliveMembers < ctx.state.config.alliance.maxSize;
}

/**
 * Erste Verteidigungslinie fuer die Reaktion des Ziels: eine Bewertung, kein
 * Wurf (siehe Kopfkommentar). Bestehendes Vertrauen zaehlt am meisten,
 * Geselligkeit und Loyalitaet sprechen dafuer, ausgepraegte Dominanz dagegen
 * — wer selbst fuehren will, ordnet sich ungern unter. **[ANNAHME]**.
 */
function acceptanceScoreFor(target: Readonly<Agent>, proposerId: AgentId): number {
  const trust = (target.relationships[proposerId]?.trust ?? 0) / 100;
  const sociability = target.personality.sociability / 100;
  const loyalty = target.personality.loyalty / 100;
  const dominance = target.personality.dominance / 100;
  return 0.35 + 0.35 * trust + 0.15 * sociability + 0.15 * loyalty - 0.2 * dominance;
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
