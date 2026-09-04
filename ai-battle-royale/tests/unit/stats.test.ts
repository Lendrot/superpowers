import { describe, expect, it } from 'vitest';

import { aggregateLongRun, giniCoefficient, sampleMatch } from '@/engine/runner/stats.js';
import type { MatchSample } from '@/engine/runner/stats.js';
import { resolveConfig } from '@/engine/core/config.js';
import { runMatch } from '@/engine/runner/runMatch.js';
import type { AgentId } from '@/engine/core/types.js';

describe('giniCoefficient', () => {
  it('ist 0 bei Gleichverteilung', () => {
    expect(giniCoefficient([5, 5, 5, 5])).toBeCloseTo(0);
  });

  it('ist 0, wenn alle nichts haben', () => {
    expect(giniCoefficient([0, 0, 0])).toBe(0);
  });

  it('ist 0 fuer eine leere Liste', () => {
    expect(giniCoefficient([])).toBe(0);
  });

  it('steigt mit zunehmender Ungleichverteilung', () => {
    const low = giniCoefficient([9, 10, 11]);
    const high = giniCoefficient([0, 0, 30]);
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(1);
  });

  it('rechnet den Lehrbuchfall (0,0,0,10) korrekt', () => {
    // Ein Agent haelt alles, drei nichts: bekanntes Beispiel mit Gini = 0.75
    // fuer n=4 nach der Standardformel.
    expect(giniCoefficient([0, 0, 0, 10])).toBeCloseTo(0.75);
  });
});

describe('aggregateLongRun', () => {
  function sample(overrides: Partial<MatchSample> = {}): MatchSample {
    return {
      seed: 1,
      rounds: 100,
      durationMs: 100,
      peakHeapBytes: 50 * 1024 * 1024,
      agents: [
        { archetype: 'striver', alive: true, score: 100, isWinner: true },
        { archetype: 'loyalist', alive: false, score: 20, isWinner: false },
      ],
      actionCounts: { rest: 10, gather_resource: 5 },
      tradePairs: [],
      alliances: [],
      leaves: 0,
      expulsions: 0,
      resourcesByAgent: [
        { food: 10, coins: 0, materials: 0 },
        { food: 0, coins: 0, materials: 0 },
      ],
      lessonsPerAgent: [2, 0],
      lessonConfidences: [0.8, 0.6],
      rejectsByReason: { schema_invalid: 1 },
      rejectRate: 0.01,
      ...overrides,
    };
  }

  it('summiert actionCounts ueber alle Matches', () => {
    const report = aggregateLongRun([sample(), sample()]);
    expect(report.actionCounts).toEqual({ rest: 20, gather_resource: 10 });
  });

  it('zaehlt Ueberleben, Siege und mittleren Score je Archetyp', () => {
    const report = aggregateLongRun([sample(), sample()]);
    expect(report.survivalByArchetype['striver']).toMatchObject({ matches: 2, survived: 2, wins: 2, meanScore: 100 });
    expect(report.survivalByArchetype['loyalist']).toMatchObject({ matches: 2, survived: 0, wins: 0, meanScore: 20 });
  });

  it('findet die haeufigsten Handelspaare', () => {
    const A: AgentId = 'agent_000';
    const B: AgentId = 'agent_001';
    const C: AgentId = 'agent_002';
    const report = aggregateLongRun([
      sample({ tradePairs: [[A, B], [A, B], [A, C]] }),
      sample({ tradePairs: [[A, B]] }),
    ]);
    expect(report.mostCommonTradePairs[0]).toMatchObject({ pair: [A, B], count: 3 });
  });

  it('rechnet Allianz-Dauer und -Groesse (Mittel + Median)', () => {
    const report = aggregateLongRun([
      sample({ alliances: [{ durationRounds: 10, sizeAtEnd: 2 }, { durationRounds: 30, sizeAtEnd: 4 }] }),
    ]);
    expect(report.alliances.totalFormed).toBe(2);
    expect(report.alliances.meanDurationRounds).toBeCloseTo(20);
    expect(report.alliances.medianDurationRounds).toBeCloseTo(20);
    expect(report.alliances.meanSizeAtEnd).toBeCloseTo(3);
  });

  it('summiert Austritte und Ausschluesse als Verratsmass', () => {
    const report = aggregateLongRun([sample({ leaves: 2, expulsions: 1 }), sample({ leaves: 1, expulsions: 0 })]);
    expect(report.betrayal).toEqual({ leaves: 3, expulsions: 1 });
  });

  it('mittelt den Gini-Koeffizienten je Ressourcenart ueber die Matches', () => {
    const report = aggregateLongRun([sample()]);
    // (10,0) bei n=2: Maximalwert der Formel ist (n-1)/n, nicht 1 — bei nur
    // zwei Punkten ist 0,5 die groesstmoegliche Ungleichverteilung.
    expect(report.resources.meanGini.food).toBeCloseTo(0.5);
    expect(report.resources.meanGini.coins).toBeCloseTo(0);
  });

  it('mittelt Lessons-pro-Agent und Konfidenz', () => {
    const report = aggregateLongRun([sample()]);
    expect(report.learning.meanLessonsPerAgent).toBeCloseTo(1);
    expect(report.learning.meanConfidence).toBeCloseTo(0.7);
  });

  it('summiert Reject-Gruende und mittelt die Reject-Rate', () => {
    const report = aggregateLongRun([sample({ rejectRate: 0.01 }), sample({ rejectRate: 0.03 })]);
    expect(report.errors.rejectsByReason['schema_invalid']).toBe(2);
    expect(report.errors.meanRejectRate).toBeCloseTo(0.02);
  });

  it('liefert einen leeren, aber gueltigen Report fuer null Matches', () => {
    const report = aggregateLongRun([]);
    expect(report.matches).toBe(0);
    expect(report.actionCounts).toEqual({});
    expect(report.alliances.meanDurationRounds).toBe(0);
  });
});

describe('sampleMatch — echte Extraktion aus einem Match', () => {
  it('liefert plausible, in sich konsistente Werte', () => {
    const config = resolveConfig({ seed: 9, agentCount: 10, maxRounds: 30 });
    const start = performance.now();
    const result = runMatch(config);
    const sample = sampleMatch(result, config.seed, performance.now() - start);

    expect(sample.rounds).toBe(result.rounds);
    expect(sample.agents).toHaveLength(10);
    expect(sample.agents.filter((a) => a.isWinner)).toHaveLength(1);
    expect(sample.resourcesByAgent).toHaveLength(10);
    expect(sample.rejectRate).toBe(result.rejectRate);
  });
});
