/**
 * Phase 4 — deterministische Utility-Policy.
 *
 * T23: die eigentlichen Bewertungen sind nach `decision/utility.ts`
 * umgezogen. Was hier bleibt, ist die Entscheidungsschale aus Doc 05 §5.2:
 * jeden Kandidaten bewerten, den Gewichtsvektor anwenden, einen winzigen
 * RNG-Tie-Break addieren, den besten waehlen.
 *
 * Entscheidend ist nicht die Qualitaet der Gewichte, sondern woher die Zahlen
 * kommen: **ausschliesslich aus der `AgentView`**. Fuer den eigenen Ort ist das
 * Anschauung, fuer jeden anderen nur Erinnerung — moeglicherweise veraltet, mit
 * abgefallener Sicherheit. Ein Agent zieht deshalb zu einem Ort, von dem er
 * *glaubt*, dass dort etwas liegt. Dass er sich irren kann, ist kein Mangel der
 * Policy, sondern der Punkt der Uebung.
 */

import type { AgentAction } from '../core/types.js';
import { EPSILON, scoreOf, weightFor } from './utility.js';
import type { Decision, DecisionProvider, ScoredCandidate } from './provider.js';

export const policyProvider: DecisionProvider = {
  name: 'policy',

  decide(view, candidates, ctx): Decision {
    if (candidates.length === 0) {
      throw new Error(`Agent ${view.self.id} hat keine Kandidaten — rest muss immer legal sein`);
    }

    const tieBreak = ctx.rng.derive('choice', ctx.round, view.self.id);
    const scored: ScoredCandidate[] = candidates.map((candidate) => {
      const raw = scoreOf(view, candidate);
      // Doc 05 §5.2: score(c) = Σ w.kategorie · term(c). Jeder Breakdown-Wert
      // wird mit dem Gewicht SEINER Kategorie multipliziert, bevor summiert
      // wird — der Breakdown selbst zeigt danach die tatsaechlich gezaehlten
      // (gewichteten) Beitraege, nicht die rohen.
      const breakdown: Record<string, number> = {};
      for (const [key, value] of Object.entries(raw)) {
        breakdown[key] = value * weightFor(key);
      }
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
      actorId: view.self.id,
      type: best.candidate.type,
      params: best.candidate.params,
      ...(best.candidate.statement ? { statement: best.candidate.statement } : {}),
      source: 'policy',
    };

    return { action, scored };
  },
};
