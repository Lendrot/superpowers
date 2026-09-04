/**
 * T26 — Doc 10 §10.1 D) "Long-Run Tests": Kennzahlen ueber viele Matches
 * hinweg, nicht nur ein einzelner Report pro Match (den liefert `sim.ts`
 * schon seit T09). `aggregateLongRun` nimmt eine Liste von `MatchSample`s
 * (je ein Match, extrahiert von `sampleMatch`) und rechnet daraus genau die
 * acht Kennzahlengruppen aus Doc 10 §10.1 D — mit zwei ehrlich benannten
 * Luecken:
 *
 * - "Anzahl gebrochener Pledges" fehlt: `Pledge` existiert erst ab T21.
 *   `betrayal` zaehlt stattdessen `leave_alliance`/`expel_member` — die
 *   einzigen heute gebauten Verratsformen (Doc 04 §4.1 Nr. 9/10).
 * - "Strategieaenderungen/Match" fehlt: `Strategy.weights` (Doc 03 §3.2.4)
 *   existiert in keinem Tag. `learning` zaehlt stattdessen, was T24
 *   tatsaechlich liefert: Lesson-Anzahl und Konfidenzverteilung.
 */

import type { AgentId, ArchetypeId, WorldState } from '../core/types.js';
import type { MatchResult } from './runMatch.js';

export interface MatchSample {
  seed: number;
  rounds: number;
  durationMs: number;
  peakHeapBytes: number;
  agents: {
    archetype: ArchetypeId;
    alive: boolean;
    score: number;
    isWinner: boolean;
  }[];
  actionCounts: Record<string, number>;
  /** `[giveKind, wantKind]`-Paare aus jedem `trade_accepted`, fuer die haeufigsten Handelspaare. */
  tradePairs: [AgentId, AgentId][];
  alliances: { durationRounds: number; sizeAtEnd: number }[];
  leaves: number;
  expulsions: number;
  resourcesByAgent: { food: number; coins: number; materials: number }[];
  lessonsPerAgent: number[];
  lessonConfidences: number[];
  rejectsByReason: Record<string, number>;
  rejectRate: number;
}

/** Extrahiert aus einem einzelnen `MatchResult` alles, was `aggregateLongRun` braucht. */
export function sampleMatch(result: Readonly<MatchResult>, seed: number, durationMs: number): MatchSample {
  const state: Readonly<WorldState> = result.state;
  const winnerId = result.leaderboard[0]?.agentId;

  const agents = result.leaderboard.map((entry) => ({
    archetype: state.agents[entry.agentId]!.archetype,
    alive: entry.alive,
    score: entry.score,
    isWinner: entry.agentId === winnerId,
  }));

  const tradePairs: [AgentId, AgentId][] = [];
  for (const event of result.log.events) {
    if (event.type !== 'trade_accepted' || !event.actorId || !event.targetId) continue;
    tradePairs.push([event.actorId, event.targetId].sort() as [AgentId, AgentId]);
  }

  const alliances = Object.values(state.alliances)
    .filter((a): a is NonNullable<typeof a> => a !== undefined)
    .map((alliance) => ({
      durationRounds: (alliance.dissolvedRound ?? result.rounds) - alliance.createdRound,
      sizeAtEnd: alliance.members.length,
    }));

  let expulsions = 0;
  // `alliance_left` traegt ein Event PRO verbleibendem Mitglied
  // (`leaveAlliance.ts`) — fuer eine Austrittszahl zaehlt der Austritt selbst
  // einmal, nicht einmal je Zeuge. Deterministisch rekonstruierbar ueber
  // `(actorId, round)`-Paare, weil ein Agent pro Runde hoechstens einmal geht.
  const uniqueLeaves = new Set<string>();
  for (const event of result.log.events) {
    if (event.type === 'alliance_left' && event.actorId) uniqueLeaves.add(`${event.actorId}:${event.round}`);
    if (event.type === 'alliance_expelled') expulsions += 1;
  }
  const leaves = uniqueLeaves.size;

  const resourcesByAgent = Object.values(state.agents)
    .filter((a): a is NonNullable<typeof a> => a !== undefined)
    .map((agent) => ({ ...agent.resources }));

  const lessonsPerAgent: number[] = [];
  const lessonConfidences: number[] = [];
  for (const agent of Object.values(state.agents)) {
    if (!agent) continue;
    const lessons = Object.values(agent.lessons);
    lessonsPerAgent.push(lessons.length);
    for (const lesson of lessons) lessonConfidences.push(lesson.confidence);
  }

  return {
    seed,
    rounds: result.rounds,
    durationMs,
    peakHeapBytes: process.memoryUsage().heapUsed,
    agents,
    actionCounts: result.actionCounts,
    tradePairs,
    alliances,
    leaves,
    expulsions,
    resourcesByAgent,
    lessonsPerAgent,
    lessonConfidences,
    rejectsByReason: result.rejects,
    rejectRate: result.rejectRate,
  };
}

export interface LongRunReport {
  matches: number;
  totalRounds: number;
  survivalByArchetype: Record<string, { matches: number; survived: number; wins: number; meanScore: number }>;
  actionCounts: Record<string, number>;
  mostCommonTradePairs: { pair: [AgentId, AgentId]; count: number }[];
  alliances: {
    totalFormed: number;
    meanDurationRounds: number;
    medianDurationRounds: number;
    meanSizeAtEnd: number;
  };
  betrayal: { leaves: number; expulsions: number };
  resources: { meanGini: { food: number; coins: number; materials: number } };
  learning: { meanLessonsPerAgent: number; meanConfidence: number };
  performance: { meanMsPerRound: number; peakHeapMB: number };
  errors: { rejectsByReason: Record<string, number>; meanRejectRate: number };
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Gini-Koeffizient ueber nicht-negative Werte, 0 (Gleichverteilung) bis
 * nahe 1 (ein Agent haelt alles). `sum === 0` (niemand hat etwas) gilt als
 * perfekte Gleichheit, nicht als undefiniert.
 */
export function giniCoefficient(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((s, v) => s + v, 0);
  if (sum === 0) return 0;
  let weightedSum = 0;
  sorted.forEach((value, index) => {
    weightedSum += (index + 1) * value;
  });
  return (2 * weightedSum - (n + 1) * sum) / (n * sum);
}

export function aggregateLongRun(samples: readonly MatchSample[]): LongRunReport {
  const survivalByArchetype: LongRunReport['survivalByArchetype'] = {};
  const actionCounts: Record<string, number> = {};
  const tradePairCounts = new Map<string, { pair: [AgentId, AgentId]; count: number }>();
  const allianceDurations: number[] = [];
  const allianceSizes: number[] = [];
  let totalFormed = 0;
  let leaves = 0;
  let expulsions = 0;
  const giniByKind = { food: [] as number[], coins: [] as number[], materials: [] as number[] };
  const lessonsPerAgent: number[] = [];
  const lessonConfidences: number[] = [];
  const rejectsByReason: Record<string, number> = {};
  const rejectRates: number[] = [];
  const msPerRound: number[] = [];
  let peakHeapBytes = 0;
  let totalRounds = 0;

  for (const sample of samples) {
    totalRounds += sample.rounds;
    msPerRound.push(sample.durationMs / Math.max(1, sample.rounds));
    peakHeapBytes = Math.max(peakHeapBytes, sample.peakHeapBytes);

    for (const agent of sample.agents) {
      const bucket = (survivalByArchetype[agent.archetype] ??= { matches: 0, survived: 0, wins: 0, meanScore: 0 });
      bucket.matches += 1;
      if (agent.alive) bucket.survived += 1;
      if (agent.isWinner) bucket.wins += 1;
      // Laufender Mittelwert statt Summe+Division am Ende — vermeidet eine
      // zweite Schleife ueber potenziell zehntausende Agenten-Eintraege.
      bucket.meanScore += (agent.score - bucket.meanScore) / bucket.matches;
    }

    for (const [type, count] of Object.entries(sample.actionCounts)) {
      actionCounts[type] = (actionCounts[type] ?? 0) + count;
    }

    for (const pair of sample.tradePairs) {
      const key = pair.join(':');
      const existing = tradePairCounts.get(key) ?? { pair, count: 0 };
      existing.count += 1;
      tradePairCounts.set(key, existing);
    }

    totalFormed += sample.alliances.length;
    for (const alliance of sample.alliances) {
      allianceDurations.push(alliance.durationRounds);
      allianceSizes.push(alliance.sizeAtEnd);
    }
    leaves += sample.leaves;
    expulsions += sample.expulsions;

    giniByKind.food.push(giniCoefficient(sample.resourcesByAgent.map((r) => r.food)));
    giniByKind.coins.push(giniCoefficient(sample.resourcesByAgent.map((r) => r.coins)));
    giniByKind.materials.push(giniCoefficient(sample.resourcesByAgent.map((r) => r.materials)));

    lessonsPerAgent.push(...sample.lessonsPerAgent);
    lessonConfidences.push(...sample.lessonConfidences);

    for (const [reason, count] of Object.entries(sample.rejectsByReason)) {
      rejectsByReason[reason] = (rejectsByReason[reason] ?? 0) + count;
    }
    rejectRates.push(sample.rejectRate);
  }

  for (const bucket of Object.values(survivalByArchetype)) {
    bucket.meanScore = Math.round(bucket.meanScore * 100) / 100;
  }

  return {
    matches: samples.length,
    totalRounds,
    survivalByArchetype,
    actionCounts,
    mostCommonTradePairs: [...tradePairCounts.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    alliances: {
      totalFormed,
      meanDurationRounds: Math.round(mean(allianceDurations) * 100) / 100,
      medianDurationRounds: median(allianceDurations),
      meanSizeAtEnd: Math.round(mean(allianceSizes) * 100) / 100,
    },
    betrayal: { leaves, expulsions },
    resources: {
      meanGini: {
        food: Math.round(mean(giniByKind.food) * 1000) / 1000,
        coins: Math.round(mean(giniByKind.coins) * 1000) / 1000,
        materials: Math.round(mean(giniByKind.materials) * 1000) / 1000,
      },
    },
    learning: {
      meanLessonsPerAgent: Math.round(mean(lessonsPerAgent) * 100) / 100,
      meanConfidence: Math.round(mean(lessonConfidences) * 1000) / 1000,
    },
    performance: {
      meanMsPerRound: Math.round(mean(msPerRound) * 1000) / 1000,
      peakHeapMB: Math.round((peakHeapBytes / (1024 * 1024)) * 100) / 100,
    },
    errors: {
      rejectsByReason,
      meanRejectRate: Math.round(mean(rejectRates) * 10000) / 10000,
    },
  };
}
