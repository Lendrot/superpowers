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
import type { AgentAction, AgentId, LocationId, ResourceKind } from '../core/types.js';
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
      ...(best.candidate.statement ? { statement: best.candidate.statement } : {}),
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
    case 'attack':
      return scoreAttack(view, candidate.params['target'] as AgentId);
    case 'share_information':
      return scoreShareInformation(view, candidate.params['target'] as AgentId);
    case 'request_information':
      return scoreRequestInformation(view, candidate.params['target'] as AgentId);
    case 'trade':
      return scoreTrade(view, candidate.params['target'] as AgentId);
    default:
      // Ein Kandidat ohne Bewertung waere ein stiller Nulltreffer. Lieber laut.
      throw new Error(`policyProvider kennt die Aktion ${candidate.type} nicht`);
  }
}

function scoreRest(view: Readonly<AgentView>): Record<string, number> {
  const energy = view.self.needs.energy / 100;
  return {
    // Je leerer der Energiespeicher, desto attraktiver Ruhe.
    survival: 0.9 * (1 - energy) * (0.7 + 0.6 * view.self.instincts.survival),
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
    //
    // Der Ueberlebensinstinkt aus der Intelligenz wirkt hier: kluge Agenten
    // essen frueher, statt es darauf ankommen zu lassen.
    survival: 2.2 * hungerPressure * hungerPressure * (0.7 + 0.6 * view.self.instincts.survival),
    // Wer schon hungert, hat keine Zeit mehr zu ueberlegen.
    urgency: view.self.status.hungerStreak > 0 ? 1.5 : 0,
    base: 0.1,
  };
}

/**
 * Angriff.
 *
 * Der Machtinstinkt aus der Kraft treibt ihn, die eingeschaetzte Staerke des
 * Gegenuebers bremst ihn — und diese Einschaetzung ist **Wissen**, keine
 * Weltwahrheit: wer den anderen nie hat kaempfen sehen, geht davon aus, dass
 * alle gleich stark begonnen haben. Er kann sich irren, und das ist der Punkt.
 *
 * Persoenlichkeit entscheidet mit: Dominanz und Ehrgeiz treiben, Empathie und
 * Loyalitaet halten zurueck. Weil beides driftet (Phase 8), wird ein Agent, der
 * einmal zugeschlagen hat, es beim naechsten Mal leichter tun.
 */
function scoreAttack(view: Readonly<AgentView>, targetId: AgentId): Record<string, number> {
  const target = view.coLocated.find((other) => other.id === targetId);
  if (!target) return { unknown: -10 };

  const own = view.self.attributes.strength;
  const theirs = target.believedStrength;
  // −1 (deutlich unterlegen) bis +1 (deutlich ueberlegen).
  const rawEdge = own + theirs === 0 ? 0 : (own - theirs) / (own + theirs);
  // Unsicherheit macht Angreifen nicht schlecht, sondern die Einschaetzung
  // weniger aussagekraeftig: eine ungepruefte Annahme zieht den vermuteten
  // Vorsprung zur Null hin. Ein flacher Abzug waere hier falsch — er koennte
  // sich nie aufloesen, weil ohne Kaempfe niemand etwas ueber fremde Kraft
  // erfaehrt, und genau diese Form von Term hat schon die Bewegung eingefroren.
  const edge = rawEdge * (0.4 + 0.6 * target.strengthCertainty);

  const empathy = view.self.personality.empathy / 100;
  const loyalty = view.self.personality.loyalty / 100;

  // Wie sehr dieser Charakter ueberhaupt zur Gewalt neigt. Der Faktor macht
  // aus dem Machtinstinkt eine Minderheitenposition: gemessen an einem Lauf
  // ueber 500 Runden fehlten dem aggressivsten Agenten 0.32 Punkte zum
  // Zuschlagen, dem durchschnittlichen ueber 0.45. Mit diesem Faktor kippt
  // genau die Spitze der Verteilung, nicht das Feld.
  const aggression =
    0.5 * (view.self.personality.dominance / 100) +
    0.3 * (view.self.personality.ambition / 100) +
    0.2 * (1 - empathy);

  // Was ein Angriff einbringt, sieht der Angreifer nicht: fremde Vorraete
  // stehen nicht in seiner Sicht, und das soll auch so bleiben. Was er weiss:
  // dass hier nichts mehr zu holen ist, dass sein eigener Beutel leer ist und
  // dass der andere etwas bei sich traegt. Der Term wiegt also die eigene Not,
  // nicht die fremde Beute — Raub als Ueberlebensweg.
  //
  // Ohne diesen Term hat `attack` als einzige Aktion keinen Ertragsteil und
  // besteht nur aus Antrieb und Hemmung. Dieselbe Luecke hatte `move`, bevor
  // die Welt einfror.
  const hunger = 1 - view.self.needs.satiety / 100;
  const foodHere = expectedShareOf(view, 'food');
  const foodStore = Math.min(1, view.self.resources.food / 5);

  // Ein Konkurrent weniger heisst mehr Ertrag fuer die, die bleiben. Der Agent
  // sieht, wer neben ihm steht und was hier liegt — er kann das ausrechnen.
  // In einer grossen Menge bringt ein Toter fast nichts, in einer kleinen
  // Gruppe um einen knappen Bestand sehr viel.
  const competitors = view.coLocated.length + 1;
  const shareNow = Math.min(1, view.here.stock.food / (competitors * EXPECTED_YIELD));
  const shareAfter = Math.min(
    1,
    view.here.stock.food / (Math.max(1, competitors - 1) * EXPECTED_YIELD),
  );

  return {
    loot: 1.2 * hunger * (1 - foodHere) * (1 - foodStore),
    rivalry: 1.4 * (shareAfter - shareNow),
    // Der Machtinstinkt ist die Triebfeder. Er haengt an der eigenen Kraft und
    // waechst mit dem eingeschaetzten Vorsprung — aber er ist auch ohne
    // Vorsprung nicht null, sonst koennte ein Feld aus lauter gleich starken
    // Agenten nie in Bewegung kommen.
    powerDrive:
      7.5 * view.self.instincts.power * aggression * (0.3 + 0.7 * Math.max(0, edge)),
    // Ehrgeiz und Dominanz als Veranlagung. Beide driften mit dem, was der
    // Agent tut — wer einmal zugeschlagen hat, tut es beim naechsten Mal leichter.
    disposition:
      0.7 * (view.self.personality.dominance / 100) + 0.4 * (view.self.personality.ambition / 100),
    // Unterlegenheit schreckt ab — und je klueger, desto ernster nimmt er das.
    risk: -2 * Math.max(0, -edge) * (0.6 + 0.8 * view.self.instincts.survival),
    // Mitgefuehl und Loyalitaet halten zurueck.
    restraint: -0.7 * empathy - 0.3 * loyalty,
    // Angreifen kostet Energie, die dann fehlt.
    cost: -0.3 - 0.5 * (1 - view.self.needs.energy / 100),
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
  // Nur der Vorrat, nicht die Energie: die steckt schon in den Wegkosten. Als
  // beides zaehlte, war der Erkundungsterm bei mittlerer Energie zwangslaeufig
  // kleiner als die Kosten — und die Welt fror ein zweiten Mal ein.
  const slack = foodStore;
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

/**
 * `share_information` — die Offenlegungsneigung aus Doc 03 §3.2.1: `honesty`
 * ist hier nicht mehr die Frage OB gelogen wird (das ist unmoeglich), sondern
 * WIE bereitwillig offengelegt wird.
 *
 * Groessenordnung bewusst klein gehalten (vgl. `scoreMove`s Erkundungsterm):
 * Reden kostet keine Energie, `move` und `gather_resource` schon. Bei
 * gleicher Groessenordnung gewinnt das Kostenlose immer, sobald ein Nachbar
 * da ist — gemessen fror die Bewegung dadurch ein zweites Mal ein, diesmal
 * durch Schwatzen statt durch Stillstand. Der Deckel haelt beide Aktionen
 * unter dem, was `rest` ohnehin schon bietet — sie fuellen die Luecke, wenn
 * nichts Dringenderes ansteht, statt sie zu verdraengen.
 */
function scoreShareInformation(view: Readonly<AgentView>, targetId: AgentId): Record<string, number> {
  const target = view.coLocated.find((other) => other.id === targetId);
  if (!target) return { unknown: -10 };

  const honesty = view.self.personality.honesty / 100;
  const sociability = view.self.personality.sociability / 100;
  const manipulation = view.self.personality.manipulation / 100;

  return {
    // Wer ehrlich UND gesellig ist, erzaehlt am ehesten von sich aus.
    disclosure: 0.35 * honesty * sociability,
    // Wissen als Handelsware (Doc 03 §3.2.1): hohe Manipulation bremst das
    // FREIWILLIGE Teilen — sie behaelt Wissen lieber fuer einen Tausch.
    withholding: -0.2 * manipulation,
    // Vertrauen vertieft man eher mit bereits Vertrauten als mit Fremden.
    rapport: 0.1 * (target.relationship.trust / 100),
    base: 0.05,
  };
}

/**
 * `trade` — anders als bei `share_information`/`request_information` steht
 * hier ein echter Ressourcenverlust auf dem Spiel, den `resolve` selbst schon
 * gegenrechnet (das Ziel akzeptiert nur, was sich fuer es lohnt). Der Score
 * muss deshalb nicht ebenso streng gedeckelt werden wie bei den kostenlosen
 * Aktionen — ein misslungenes Angebot kostet ohnehin nur die Runde, kein
 * Vermoegen.
 */
function scoreTrade(view: Readonly<AgentView>, targetId: AgentId): Record<string, number> {
  const target = view.coLocated.find((other) => other.id === targetId);
  if (!target) return { unknown: -10 };

  const ambition = view.self.personality.ambition / 100;
  const sociability = view.self.personality.sociability / 100;

  return {
    dealmaking: 0.5 * ambition * sociability,
    trustBonus: 0.15 * (target.relationship.trust / 100),
    base: 0.1,
  };
}

/**
 * `request_information` — Neugier, gedaempft durch dieselbe Nahbarkeit.
 * Dieselbe Groessenordnungsgrenze wie `scoreShareInformation`, aus demselben
 * Grund: kostenlose Neugier darf `move`s Erkundung nicht verdraengen.
 */
function scoreRequestInformation(view: Readonly<AgentView>, targetId: AgentId): Record<string, number> {
  const target = view.coLocated.find((other) => other.id === targetId);
  if (!target) return { unknown: -10 };

  const sociability = view.self.personality.sociability / 100;

  return {
    curiosity: 0.3 * sociability,
    // Man fragt eher jemanden, dem man schon traut.
    trustBonus: 0.1 * (target.relationship.trust / 100),
    base: 0.05,
  };
}
