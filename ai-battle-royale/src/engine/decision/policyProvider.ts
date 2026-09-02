/**
 * Phase 4 — deterministische Utility-Policy.
 *
 * ACHTUNG, Umfang: das hier ist NICHT T23. Die volle Utility-Funktion aus
 * Doc 05 §5.2 braucht `strategy.weights`, Ziele, Lessons und Beziehungen —
 * alles Dinge, die es noch nicht gibt. Was hier steht, ist die kleinste Policy,
 * die vier Aktionen unterscheidbar macht und dabei die Form aus §5.2 einhaelt:
 * gewichtete Terme, einzeln ausgewiesen (`breakdown`), plus ein winziger
 * RNG-Tie-Break.
 *
 * Entscheidend ist nicht die Qualitaet der Gewichte, sondern woher die Zahlen
 * kommen: **ausschliesslich aus der `AgentView`**. Fuer den eigenen Ort ist das
 * Anschauung, fuer jeden anderen nur Erinnerung — moeglicherweise veraltet, mit
 * abgefallener Sicherheit. Ein Agent zieht deshalb zu einem Ort, von dem er
 * *glaubt*, dass dort etwas liegt. Dass er sich irren kann, ist kein Mangel der
 * Policy, sondern der Punkt der Uebung.
 *
 * Die Gewichte sind **[ANNAHME]**.
 */

import type { AgentView } from '../agents/agentView.js';
import { believedStock } from '../agents/agentView.js';
import type { AgentAction, LocationId, ResourceKind } from '../core/types.js';
import { stockInfoId } from '../information/infoRegistry.js';
import type { ActionCandidate } from '../actions/types.js';
import type { Decision, DecisionProvider, ScoredCandidate } from './provider.js';

/** Gewicht des Zufalls-Tie-Breaks. Gross genug zum Trennen, klein genug, um nie zu dominieren. */
const EPSILON = 0.001;

/** Ab wieviel eigenem Vorrat gilt eine Ressource als gedeckt. **[ANNAHME]** */
const SATURATION: Record<ResourceKind, number> = { food: 12, coins: 40, materials: 10 };

/** Grober Erwartungswert einer Ernte, fuer die Einschaetzung der Konkurrenz. */
const EXPECTED_YIELD = 3;

/** Ab diesem Bestand gilt ein Ort als reichlich versorgt. **[ANNAHME]** */
const STOCK_SCALE = 20;

/** Nahrung zaehlt mehr als Material, weil nur sie das Ueberleben sichert. */
const KIND_WEIGHT = { food: 1, materials: 0.6 } as const;

export const policyProvider: DecisionProvider = {
  name: 'policy',

  decide(view, candidates, ctx): Decision {
    if (candidates.length === 0) {
      throw new Error(`Agent ${view.self.id} hat keine Kandidaten — rest muss immer legal sein`);
    }

    const tieBreak = ctx.rng.derive('choice', ctx.round, view.self.id);
    const scored: ScoredCandidate[] = candidates.map((candidate) => {
      const breakdown = scoreOf(view, candidate);
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
      source: 'policy',
    };

    return { action, scored };
  },
};

function scoreOf(view: Readonly<AgentView>, candidate: ActionCandidate): Record<string, number> {
  switch (candidate.type) {
    case 'rest':
      return scoreRest(view);
    case 'consume':
      return scoreConsume(view);
    case 'move':
      return scoreMove(view, candidate.params['to'] as LocationId);
    case 'gather_resource':
      return scoreGather(view, candidate.params['resource'] as ResourceKind);
    default:
      // Ein Kandidat ohne Bewertung waere ein stiller Nulltreffer. Lieber laut.
      throw new Error(`policyProvider kennt die Aktion ${candidate.type} nicht`);
  }
}

function scoreRest(view: Readonly<AgentView>): Record<string, number> {
  const energy = view.self.needs.energy / 100;
  return {
    // Je leerer der Energiespeicher, desto attraktiver Ruhe.
    survival: 0.9 * (1 - energy),
    // Vorsichtige Naturen ruhen frueher.
    caution: 0.25 * (1 - view.self.personality.riskTaking / 100),
    base: 0.15,
  };
}

function scoreConsume(view: Readonly<AgentView>): Record<string, number> {
  const satiety = view.self.needs.satiety / 100;
  const hungerPressure = 1 - satiety;

  return {
    // Essen ist die einzige Handlung, die Verhungern abwendet. Der Term waechst
    // quadratisch: bei halber Saettigung ist es eine Option, bei leerem Magen
    // schlaegt es alles andere.
    survival: 2.2 * hungerPressure * hungerPressure,
    // Wer schon hungert, hat keine Zeit mehr zu ueberlegen.
    urgency: view.self.status.hungerStreak > 0 ? 1.5 : 0,
    base: 0.1,
  };
}

function scoreMove(view: Readonly<AgentView>, to: LocationId): Record<string, number> {
  const energy = view.self.needs.energy / 100;

  // Was glaubt der Agent, dort vorzufinden? Ohne Erinnerung: nichts.
  let expectation = 0;
  let confidence = 0;
  for (const kind of ['food', 'materials'] as const) {
    const belief = believedStock(view, to, kind, stockInfoId);
    if (!belief) continue;
    expectation += KIND_WEIGHT[kind] * Math.min(1, belief.value / STOCK_SCALE) * belief.certainty;
    confidence = Math.max(confidence, belief.certainty);
  }

  // Dieselbe Rechnung fuer den eigenen Ort, damit die Erinnerung einen
  // Vergleich ergibt und keine absolute Zahl. Vorher zog eine Erinnerung an
  // "dort lagen 20 Nahrung" auch dann, wenn hier 40 liegen — ein Umzug, der
  // nichts verbessert, aber eine Runde kostet.
  let hereValue = 0;
  for (const kind of ['food', 'materials'] as const) {
    hereValue += KIND_WEIGHT[kind] * Math.min(1, view.here.stock[kind] / STOCK_SCALE);
  }

  // Was ist hier noch zu holen? Dieselbe Rechnung wie bei `gather`, damit
  // "bleiben" und "gehen" auf derselben Skala verglichen werden.
  const hereProspect = Math.max(
    expectedShareOf(view, 'food'),
    0.6 * expectedShareOf(view, 'materials'),
  );

  // Hier waechst nichts Essbares, der eigene Vorrat geht zur Neige, und die
  // Saettigung faellt: dann ist Gehen keine Optimierung mehr, sondern
  // Ueberleben. Ohne diesen Term verhungern Agenten, die an `workshop` oder
  // `outskirts` starten — dort ist die Nahrungskapazitaet null, es kann also
  // nie etwas nachwachsen. Gemessen waren das 10 von 30 Agenten in 400 Runden,
  // die auf einem Ort sitzen blieben, an dem sie nichts zu essen finden konnten.
  const hunger = 1 - view.self.needs.satiety / 100;
  const foodHere = expectedShareOf(view, 'food');
  const foodStore = Math.min(1, view.self.resources.food / 5);

  // Nachsehen lohnt sich, wenn man wenig weiss und es sich leisten kann.
  //
  // Beide Faktoren sind noetig, und beide waren vorher falsch modelliert:
  //
  // - `1 - confidence` statt `confidence === 0`. Wissen verfaellt (Doc 03
  //   §3.4.2), also ist Unwissen kein Zustand, sondern ein Grad. Eine
  //   Ueberzeugung, die auf halbe Sicherheit gefallen ist, ist ein halber Grund
  //   nachzusehen — kein gar keiner.
  //
  // - `slack`: Erkundung ist Luxus. Wer Energie im Speicher und Nahrung im
  //   Beutel hat, kann eine Runde fuer einen Blick opfern; wer knapp dran ist,
  //   nicht.
  //
  // Entscheidend ist die Groessenordnung: der Term muss die Wegkosten
  // ueberhaupt schlagen koennen. Vorher lag er bei hoechstens 0.15 gegen
  // Kosten von mindestens 0.45 — er konnte also nie gewinnen, und die Welt
  // stand nach Runde 289 still: 1 700 Runden lang zog kein Agent mehr um,
  // obwohl seine Ueberzeugungen ueber die Nachbarorte laengst verfallen waren.
  // Ausgerechnet der Wissensverfall, der Neugier ausloesen sollte, schaltete
  // sie ab.
  const slack = energy * foodStore;
  const curiosity = 0.35 + 0.65 * (view.self.personality.riskTaking / 100);

  return {
    survival: 1.6 * hunger * (1 - foodHere) * (1 - foodStore),
    // Erinnerung an einen BESSEREN Ort — der beste Grund, ueberhaupt zu gehen.
    // Ein Umzug zahlt sich ueber viele Runden aus, nicht nur in der naechsten;
    // deshalb wiegt der Vorsprung schwerer als die einmaligen Wegkosten.
    memory: 1.4 * Math.max(0, expectation - hereValue),
    // Je weniger hier fuer einen abfaellt, desto eher lohnt der Aufbruch.
    scarcityHere: 0.6 * (1 - hereProspect),
    exploration: 0.7 * (1 - confidence) * slack * curiosity,
    // Wandern kostet Energie und eine Runde.
    cost: -0.45 - 0.25 * (1 - energy),
  };
}

function scoreGather(view: Readonly<AgentView>, kind: ResourceKind): Record<string, number> {
  const energy = view.self.needs.energy / 100;
  const own = view.self.resources[kind];
  const scarcity = 1 - Math.min(1, own / SATURATION[kind]);
  const share = expectedShareOf(view, kind);

  // Alle Ertragsterme sind mit dem erwarteten Anteil multipliziert, nicht zu ihm
  // addiert. Der Unterschied ist nicht kosmetisch: mit additiven Termen bekam
  // Ernten Punkte fuers blosse Energiehaben und gewann auch dort, wo nichts mehr
  // lag — gemessen 2 828 Fehlernten und kein einziger Ortswechsel in 400 Runden.
  // Multiplikativ faellt der Wert auf null, wenn nichts zu holen ist, und
  // `move` bekommt eine Chance.
  return {
    yield: 1.1 * share,
    // Was man selbst kaum hat, ist mehr wert — aber nur, wenn es hier liegt.
    need: 0.7 * scarcity * share,
    // Ehrgeiz treibt zum Sammeln.
    ambition: 0.15 * (view.self.personality.ambition / 100) * share,
    // Nahrung ist die einzige Ressource, an der das Ueberleben haengt.
    foodBias: kind === 'food' ? 0.2 * share : 0,
    // Ernten kostet Energie, die dann anderswo fehlt.
    fatigue: -0.35 * (1 - energy),
  };
}

/**
 * Der Anteil am hiesigen Bestand, den ein Agent fuer sich erwarten kann:
 * Bestand geteilt durch die Anwesenden. Er sieht dafuer nur, wer neben ihm
 * steht — kein Fremdwissen.
 */
function expectedShareOf(view: Readonly<AgentView>, kind: ResourceKind): number {
  const competitors = view.coLocated.length + 1;
  return Math.min(1, view.here.stock[kind] / (competitors * EXPECTED_YIELD));
}
