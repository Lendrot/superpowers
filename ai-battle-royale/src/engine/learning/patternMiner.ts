/**
 * T24 — Phase 10: Pattern-Miner (Doc 03 §6.3, Pfad A).
 *
 * **Deckungsluecke gegenueber Doc 03s Beispieltabelle**, ehrlich benannt statt
 * stillschweigend nachgebildet: `keeps_pledges`/`breaks_pledges` brauchen
 * `Pledge` (T21), `strategy_v{n}_underperformed` braucht `Strategy.weights`
 * (existiert in keinem Tag), `food_scarce_early` ist `about_world` und
 * Match-uebergreifend — keine der drei ist aus dem, was gebaut ist, herleitbar.
 * Die sechs hier stehenden Detektoren sind stattdessen vollstaendig aus
 * bereits existierenden Systemen gespeist (Episoden aus T22, Allianzen aus
 * T20, Beziehungen aus T19) und decken dieselbe Bandbreite ab wie Doc 03s
 * Beispiele: Informationsverhalten, Handelsverhalten, Gewalt, Bündnistreue.
 *
 * **Kein `reflectionInterval`-Gate.** Das gehoert laut Doc 03 §6.3 zu Pfad B
 * (LLM Reflection) — es begrenzt LLM-Kosten. Pfad A ist deterministisch und
 * billig (hoechstens `maxEpisodes` = 60 Eintraege je Agent), es gibt keinen
 * Grund, ihn zu drosseln. Er laeuft deshalb jede Runde, fuer jeden lebenden
 * Agenten neu — kein Upsert, sondern eine vollstaendige Neuberechnung aus dem
 * AKTUELLEN `episodic`-Bestand (siehe `Effect['lesson_sync']`).
 *
 * Jeder Detektor zaehlt nur Episoden mit `role`, die eine EIGENE Interaktion
 * mit dem Subjekt bedeuten (`actor`/`target`/`told`) — nie `witness`: was ich
 * bei einem Dritten beobachtet habe, ist ein Muster ueber diesen Dritten, kein
 * Beleg fuer meine eigene Beziehung zu ihm. Diese sechs Lessons sind deshalb
 * bewusst alle `scope: 'about_agent'`.
 */

import { aliveAgents } from '../core/access.js';
import type { Agent, AgentId, Effect, EpisodicMemory, EventType, Lesson, Round, WorldState } from '../core/types.js';
import { effect } from '../mutation/effects.js';

interface Tally {
  evidence: number;
  contradictory: number;
  episodes: { id: EpisodicMemory['id']; salience: number }[];
}

interface DetectorSpec {
  name: string;
  matchRole: (role: EpisodicMemory['role']) => boolean;
  isEvidence: (type: EventType) => boolean;
  isContradictory: (type: EventType) => boolean;
  statement: (subjectName: string) => string;
}

const DETECTORS: readonly DetectorSpec[] = [
  {
    name: 'shares_information',
    matchRole: (role) => role === 'told',
    isEvidence: (type) => type === 'information_shared',
    isContradictory: (type) => type === 'information_refused',
    statement: (name) => `${name} teilt Wissen bereitwillig mit mir.`,
  },
  {
    name: 'withholds_from_me',
    matchRole: (role) => role === 'told',
    isEvidence: (type) => type === 'information_refused',
    isContradictory: (type) => type === 'information_shared',
    statement: (name) => `${name} haelt Wissen eher zurueck, als es mir zu geben.`,
  },
  {
    // Redefiniert gegenueber Doc 03 (dort: Verhaeltnis erhaltener/gegebener
    // Werte) zu einer Erfolgsquote — `EpisodicMemory` traegt keine
    // Tauschbetraege, nur `eventType`/`role`/`valence`. Eine Erfolgsquote ist
    // dieselbe Grundfrage ("lohnt sich Handel mit X?") mit dem, was tatsaechlich
    // im Speicher steht.
    name: 'trades_fairly',
    matchRole: (role) => role === 'actor' || role === 'target',
    isEvidence: (type) => type === 'trade_accepted',
    isContradictory: (type) => type === 'trade_declined',
    statement: (name) => `Handel mit ${name} kommt meistens zustande.`,
  },
  {
    name: 'attacked_me',
    matchRole: (role) => role === 'target',
    isEvidence: (type) => type === 'agent_attacked' || type === 'agent_killed',
    isContradictory: () => false,
    statement: (name) => `${name} hat mich schon angegriffen.`,
  },
  {
    name: 'left_alliance',
    // Nur `target`: das ist die Rolle, die ich als VERBLEIBENDES Mitglied
    // trage, wenn ein anderer geht (`leaveAlliance.ts`). Bei `actor` waere
    // ICH die Gehende — das Gegenteil dessen, was dieser Schluessel misst.
    matchRole: (role) => role === 'target',
    isEvidence: (type) => type === 'alliance_left',
    isContradictory: () => false,
    statement: (name) => `${name} hat schon einmal eine Allianz verlassen, der ich angehoerte.`,
  },
  {
    // Vereinfachung: `alliance_expelled` zaehlt in beide Rollen als
    // Gegenbeleg (ob X mich ausschloss oder ich X — beides ist ein
    // gescheitertes Buendnis mit X), nicht nur die Richtung "X gegen mich".
    name: 'reliable_ally',
    matchRole: (role) => role === 'actor' || role === 'target',
    isEvidence: (type) => type === 'alliance_offer_accepted',
    isContradictory: (type) => type === 'alliance_expelled' || type === 'alliance_left',
    statement: (name) => `${name} haelt zu Buendnissen mit mir.`,
  },
];

function lessonKey(detectorName: string, subject: AgentId): string {
  return `${detectorName}(${subject})`;
}

function tallyFor(spec: DetectorSpec, episodic: readonly EpisodicMemory[], selfId: AgentId): Map<AgentId, Tally> {
  const tallies = new Map<AgentId, Tally>();
  for (const episode of episodic) {
    if (!spec.matchRole(episode.role)) continue;
    const evidence = spec.isEvidence(episode.eventType);
    const contradictory = spec.isContradictory(episode.eventType);
    if (!evidence && !contradictory) continue;

    const subject = episode.participants.find((id) => id !== selfId);
    if (!subject) continue;

    const tally = tallies.get(subject) ?? { evidence: 0, contradictory: 0, episodes: [] };
    if (evidence) tally.evidence += 1;
    if (contradictory) tally.contradictory += 1;
    tally.episodes.push({ id: episode.id, salience: episode.salience });
    tallies.set(subject, tally);
  }
  return tallies;
}

/**
 * Die fuenf Episoden mit der hoechsten Salience als Beleg — CLAUDE.md Regel 8
 * verlangt mindestens eine, Doc 03 §6.1 deckelt auf fuenf. Absteigend nach
 * Salience, `id` (= `EventId`, zeitlich geordnet) als deterministischer
 * Tie-Break.
 */
function topSupportingEpisodes(episodes: Tally['episodes']): EpisodicMemory['id'][] {
  return [...episodes]
    .sort((a, b) => b.salience - a.salience || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, 5)
    .map((e) => e.id);
}

export interface MinedLessons {
  lessons: Record<string, Lesson>;
}

/**
 * Rechnet den vollstaendigen Lesson-Satz eines Agenten neu aus seinen
 * AKTUELLEN Episoden — kein Upsert (siehe Kopfkommentar). `existing` liefert
 * nur `firstLearnedRound` weiter, sonst ist jede Lesson ein frischer Schnitt
 * durch den Episodenbestand.
 */
export function mineLessons(
  agent: Readonly<Agent>,
  round: Round,
  nameOf: (id: AgentId) => string,
  evidenceCap: number,
  maxLessons: number,
): MinedLessons {
  const candidates: Lesson[] = [];

  for (const spec of DETECTORS) {
    const tallies = tallyFor(spec, agent.episodic, agent.id);
    for (const [subject, tally] of tallies) {
      const key = lessonKey(spec.name, subject);
      const cappedEvidence = Math.min(tally.evidence, evidenceCap);
      const cappedContradictory = Math.min(tally.contradictory, evidenceCap);
      const confidence = (cappedEvidence + 1) / (cappedEvidence + cappedContradictory + 2);
      const previous = agent.lessons[key];

      candidates.push({
        key,
        scope: 'about_agent',
        subjectRef: subject,
        statement: spec.statement(nameOf(subject)),
        confidence,
        evidenceCount: cappedEvidence,
        contradictoryEvidence: cappedContradictory,
        supportingEpisodeIds: topSupportingEpisodes(tally.episodes),
        firstLearnedRound: previous?.firstLearnedRound ?? round,
        lastUpdated: round,
        persistAcrossMatches: false,
      });
    }
  }

  // Deckel: die am staerksten belegten Lessons zuerst (Gesamtevidenz, dann
  // Konfidenz, dann Schluessel als deterministischer Tie-Break) — dieselbe
  // "was am meisten Gewicht traegt, bleibt" Logik wie bei der
  // Episoden-Kompaktierung, nur ohne Aggregation: eine verdraengte Lesson
  // entsteht im naechsten Lauf mit genug Evidenz einfach wieder.
  candidates.sort((a, b) => {
    const totalA = a.evidenceCount + a.contradictoryEvidence;
    const totalB = b.evidenceCount + b.contradictoryEvidence;
    if (totalA !== totalB) return totalB - totalA;
    if (a.confidence !== b.confidence) return b.confidence - a.confidence;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  const lessons: Record<string, Lesson> = {};
  for (const lesson of candidates.slice(0, maxLessons)) {
    lessons[lesson.key] = lesson;
  }
  return { lessons };
}

export interface LearningResult {
  effects: Effect[];
  /** Nur zur Diagnose: fuer wieviele Agenten sich der Lesson-Satz veraendert hat. */
  changed: number;
}

/**
 * Phase 10: fuer jeden lebenden Agenten den Lesson-Satz neu gegen die
 * aktuellen Episoden rechnen. Immer, jede Runde — siehe Kopfkommentar zum
 * fehlenden `reflectionInterval`-Gate.
 */
export function learningEffects(state: Readonly<WorldState>, round: Round): LearningResult {
  const effects: Effect[] = [];
  let changed = 0;
  const nameOf = (id: AgentId): string => state.agents[id]?.name ?? id;

  for (const agent of aliveAgents(state)) {
    const { lessons } = mineLessons(agent, round, nameOf, state.config.learning.evidenceCap, state.config.learning.maxLessons);
    if (lessonsEqual(agent.lessons, lessons)) continue;
    changed += 1;
    effects.push(effect.lessonSync(agent.id, lessons));
  }

  return { effects, changed };
}

/**
 * Vergleicht zwei Lesson-Saetze auf inhaltliche Gleichheit — verhindert
 * leere `lesson_sync`-Effekte, wenn sich nichts geaendert hat.
 *
 * `lastUpdated` faellt bewusst aus dem Vergleich: `mineLessons` stempelt es
 * bei JEDEM Lauf auf die aktuelle Runde, egal ob sich Beweislage oder
 * Konfidenz bewegt haben. Ohne diesen Ausschluss waere `lessonsEqual` nie
 * wahr, sobald ueberhaupt eine Lesson existiert — und `lastUpdated` selbst
 * verlöre seine Bedeutung ("zuletzt inhaltlich veraendert" statt "zuletzt
 * neu gerechnet").
 */
function lessonsEqual(a: Readonly<Record<string, Lesson>>, b: Readonly<Record<string, Lesson>>): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    const lessonA = a[key];
    const lessonB = b[key];
    if (!lessonB) return false;
    if (
      lessonA!.confidence !== lessonB.confidence ||
      lessonA!.evidenceCount !== lessonB.evidenceCount ||
      lessonA!.contradictoryEvidence !== lessonB.contradictoryEvidence
    ) {
      return false;
    }
  }
  return true;
}
