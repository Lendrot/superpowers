/**
 * Phase 4 — deterministische Utility-Policy.
 *
 * ACHTUNG, Umfang: das hier ist NICHT T23. Die volle Utility-Funktion aus
 * Doc 05 §5.2 braucht `strategy.weights`, Ziele, Lessons und Beziehungen —
 * alles Dinge, die es im Kern noch nicht gibt. Was hier steht, ist die kleinste
 * Policy, die zwei Aktionen unterscheidbar macht und dabei die Form aus §5.2
 * bereits einhaelt: gewichtete Terme, einzeln ausgewiesen (`breakdown`), plus
 * ein winziger RNG-Tie-Break.
 *
 * Die Gewichte sind **[ANNAHME]**.
 */

import { getLocation } from '../core/access.js';
import type { Agent, AgentAction, ResourceKind } from '../core/types.js';
import type { ActionCandidate } from '../actions/types.js';
import type { Decision, DecisionContext, DecisionProvider, ScoredCandidate } from './provider.js';

/** Gewicht des Zufalls-Tie-Breaks. Gross genug zum Trennen, klein genug, um nie zu dominieren. */
const EPSILON = 0.001;

/** Ab wieviel eigenem Vorrat gilt eine Ressource als gedeckt. **[ANNAHME]** */
const SATURATION: Record<ResourceKind, number> = { food: 12, coins: 40, materials: 10 };

/** Grober Erwartungswert einer Ernte, fuer die Einschaetzung der Konkurrenz. */
const EXPECTED_YIELD = 3;

export const policyProvider: DecisionProvider = {
  name: 'policy',

  decide(agent, candidates, ctx): Decision {
    if (candidates.length === 0) {
      throw new Error(`Agent ${agent.id} hat keine Kandidaten — rest muss immer legal sein`);
    }

    const tieBreak = ctx.rng.derive('choice', ctx.round, agent.id);
    const scored: ScoredCandidate[] = candidates.map((candidate) => {
      const breakdown = scoreOf(agent, candidate, ctx);
      breakdown['tieBreak'] = EPSILON * tieBreak.float();
      const score = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
      return { candidate, score, breakdown };
    });

    // Bester Score; bei exaktem Gleichstand entscheidet das Label — der
    // Tie-Break oben macht das praktisch nie noetig, aber "praktisch nie" ist
    // fuer einen Determinismus-Vertrag zu wenig.
    const best = scored.reduce((a, b) => {
      if (b.score !== a.score) return b.score > a.score ? b : a;
      return b.candidate.label < a.candidate.label ? b : a;
    });

    const action: AgentAction = {
      actorId: agent.id,
      type: best.candidate.type,
      params: best.candidate.params,
      source: 'policy',
    };

    return { action, scored };
  },
};

function scoreOf(
  agent: Readonly<Agent>,
  candidate: ActionCandidate,
  ctx: DecisionContext,
): Record<string, number> {
  const energy = agent.needs.energy / 100;

  if (candidate.type === 'rest') {
    return {
      // Je leerer der Energiespeicher, desto attraktiver Ruhe.
      survival: 0.9 * (1 - energy),
      // Vorsichtige Naturen ruhen frueher.
      caution: 0.25 * (1 - agent.personality.riskTaking / 100),
      base: 0.15,
    };
  }

  const kind = candidate.params['resource'] as ResourceKind;
  const location = getLocation(ctx.state, agent.location);
  const own = agent.resources[kind];
  const scarcity = 1 - Math.min(1, own / SATURATION[kind]);

  // Erwarteter Anteil: der Bestand am Ort, geteilt durch die Anwesenden. Ohne
  // diesen Term rennen alle jede Runde auf denselben Bestand und mehr als die
  // Haelfte aller Ernten laeuft ins Leere (gemessen: 4 585 von 8 605 in 400
  // Runden). Der Agent sieht dafuer nur, wer neben ihm steht — kein Fremdwissen.
  const competitors = Math.max(1, ctx.occupancy[agent.location] ?? 1);
  const expectedShare = Math.min(1, location.stock[kind] / (competitors * EXPECTED_YIELD));

  return {
    // Ernten lohnt sich nur mit Energie im Speicher.
    capacity: 0.7 * energy,
    // Was man selbst kaum hat, ist mehr wert.
    scarcity: 0.45 * scarcity,
    // Ein Ort mit viel Bestand und wenig Konkurrenz verspricht Ertrag.
    opportunity: 0.45 * expectedShare,
    // Ehrgeiz treibt zum Sammeln.
    ambition: 0.2 * (agent.personality.ambition / 100),
    // Nahrung ist die einzige Ressource, an der ab T08 das Ueberleben haengt.
    foodBias: kind === 'food' ? 0.2 : 0,
  };
}
