import { describe, expect, it } from 'vitest';

import { mineLessons } from '@/engine/learning/patternMiner.js';
import type { Agent, AgentId, EpisodicMemory, EventType, Lesson } from '@/engine/core/types.js';

const SELF: AgentId = 'agent_000';
const X: AgentId = 'agent_001';
const Y: AgentId = 'agent_002';

function episode(patch: Partial<EpisodicMemory> & Pick<EpisodicMemory, 'id' | 'eventType' | 'role' | 'participants'>): EpisodicMemory {
  return {
    round: 1,
    valence: 0,
    salience: 0.5,
    summaryKey: `${patch.eventType}:${patch.participants.join('-')}`,
    ...patch,
  };
}

function agentWith(episodic: EpisodicMemory[], lessons: Record<string, Lesson> = {}): Readonly<Agent> {
  return {
    id: SELF,
    episodic,
    lessons,
  } as unknown as Readonly<Agent>;
}

const nameOf = (id: AgentId): string => id;

describe('mineLessons — Detektoren', () => {
  it('shares_information(X): information_shared als Beleg, information_refused als Gegenbeleg', () => {
    const episodic = [
      episode({ id: 'event_0001_00000' as EpisodicMemory['id'], eventType: 'information_shared', role: 'told', participants: [SELF, X].sort() }),
      episode({ id: 'event_0002_00000' as EpisodicMemory['id'], eventType: 'information_shared', role: 'told', participants: [SELF, X].sort() }),
      episode({ id: 'event_0003_00000' as EpisodicMemory['id'], eventType: 'information_refused', role: 'told', participants: [SELF, X].sort() }),
    ];
    const { lessons } = mineLessons(agentWith(episodic), 5, nameOf, 20, 30);
    const lesson = lessons[`shares_information(${X})`];
    expect(lesson).toBeDefined();
    expect(lesson!.evidenceCount).toBe(2);
    expect(lesson!.contradictoryEvidence).toBe(1);
    expect(lesson!.confidence).toBeCloseTo((2 + 1) / (2 + 1 + 2));
  });

  it('withholds_from_me(X) ist die Spiegelung derselben Episoden', () => {
    const episodic = [
      episode({ id: 'event_0001_00000' as EpisodicMemory['id'], eventType: 'information_refused', role: 'told', participants: [SELF, X].sort() }),
    ];
    const { lessons } = mineLessons(agentWith(episodic), 5, nameOf, 20, 30);
    expect(lessons[`withholds_from_me(${X})`]!.evidenceCount).toBe(1);
    expect(lessons[`withholds_from_me(${X})`]!.contradictoryEvidence).toBe(0);
    // Dieselbe Episode zaehlt spiegelbildlich als GEGENBELEG fuer
    // shares_information — kein Beleg, aber der Detektor legt trotzdem einen
    // Eintrag an (evidence=0, contradictory=1 ist eine gueltige Bilanz).
    expect(lessons[`shares_information(${X})`]).toMatchObject({ evidenceCount: 0, contradictoryEvidence: 1 });
  });

  it('trades_fairly(X): trade_accepted vs. trade_declined', () => {
    const episodic = [
      episode({ id: 'event_0001_00000' as EpisodicMemory['id'], eventType: 'trade_accepted', role: 'actor', participants: [SELF, X].sort() }),
      episode({ id: 'event_0002_00000' as EpisodicMemory['id'], eventType: 'trade_declined', role: 'target', participants: [SELF, X].sort() }),
    ];
    const { lessons } = mineLessons(agentWith(episodic), 5, nameOf, 20, 30);
    const lesson = lessons[`trades_fairly(${X})`]!;
    expect(lesson.evidenceCount).toBe(1);
    expect(lesson.contradictoryEvidence).toBe(1);
  });

  it('attacked_me(X): nur role target, kein Gegenbeleg moeglich', () => {
    const episodic = [
      episode({ id: 'event_0001_00000' as EpisodicMemory['id'], eventType: 'agent_attacked', role: 'target', participants: [SELF, X].sort() }),
      // role 'actor' (ICH habe X angegriffen) zaehlt NICHT fuer "X hat mich angegriffen".
      episode({ id: 'event_0002_00000' as EpisodicMemory['id'], eventType: 'agent_attacked', role: 'actor', participants: [SELF, X].sort() }),
    ];
    const { lessons } = mineLessons(agentWith(episodic), 5, nameOf, 20, 30);
    const lesson = lessons[`attacked_me(${X})`]!;
    expect(lesson.evidenceCount).toBe(1);
    expect(lesson.contradictoryEvidence).toBe(0);
  });

  it('left_alliance(X): nur role target (ich blieb, X ging)', () => {
    const episodic = [
      episode({ id: 'event_0001_00000' as EpisodicMemory['id'], eventType: 'alliance_left', role: 'target', participants: [SELF, X].sort() }),
      // role 'actor' waere: ICH bin gegangen — kein Beleg ueber X.
      episode({ id: 'event_0002_00000' as EpisodicMemory['id'], eventType: 'alliance_left', role: 'actor', participants: [SELF, Y].sort() }),
    ];
    const { lessons } = mineLessons(agentWith(episodic), 5, nameOf, 20, 30);
    expect(lessons[`left_alliance(${X})`]!.evidenceCount).toBe(1);
    expect(lessons[`left_alliance(${Y})`]).toBeUndefined();
  });

  it('reliable_ally(X): alliance_offer_accepted als Beleg, expel/left als Gegenbeleg', () => {
    const episodic = [
      episode({ id: 'event_0001_00000' as EpisodicMemory['id'], eventType: 'alliance_offer_accepted', role: 'actor', participants: [SELF, X].sort() }),
      episode({ id: 'event_0002_00000' as EpisodicMemory['id'], eventType: 'alliance_expelled', role: 'target', participants: [SELF, X].sort() }),
    ];
    const { lessons } = mineLessons(agentWith(episodic), 5, nameOf, 20, 30);
    const lesson = lessons[`reliable_ally(${X})`]!;
    expect(lesson.evidenceCount).toBe(1);
    expect(lesson.contradictoryEvidence).toBe(1);
  });

  it('ignoriert witness-Episoden fuer alle Detektoren', () => {
    const episodic = [
      episode({ id: 'event_0001_00000' as EpisodicMemory['id'], eventType: 'agent_killed', role: 'witness', participants: [X, Y].sort() }),
    ];
    const { lessons } = mineLessons(agentWith(episodic), 5, nameOf, 20, 30);
    expect(Object.keys(lessons)).toEqual([]);
  });
});

describe('mineLessons — Laplace-Confidence und Deckel', () => {
  it('deckelt evidence/contradictory auf evidenceCap VOR der Confidence-Berechnung', () => {
    const episodic = Array.from({ length: 25 }, (_, i) =>
      episode({
        id: `event_${String(i + 1).padStart(4, '0')}_00000` as EpisodicMemory['id'],
        eventType: 'agent_attacked' as EventType,
        role: 'target',
        participants: [SELF, X].sort(),
      }),
    );
    const { lessons } = mineLessons(agentWith(episodic), 5, nameOf, 20, 30);
    const lesson = lessons[`attacked_me(${X})`]!;
    expect(lesson.evidenceCount).toBe(20); // gedeckelt, nicht 25
    expect(lesson.confidence).toBeCloseTo((20 + 1) / (20 + 0 + 2));
  });

  it('waehlt die 5 salientesten Episoden als supportingEpisodeIds', () => {
    const episodic = Array.from({ length: 8 }, (_, i) =>
      episode({
        id: `event_${String(i + 1).padStart(4, '0')}_00000` as EpisodicMemory['id'],
        eventType: 'agent_attacked' as EventType,
        role: 'target',
        participants: [SELF, X].sort(),
        salience: i / 10,
      }),
    );
    const { lessons } = mineLessons(agentWith(episodic), 5, nameOf, 20, 30);
    const lesson = lessons[`attacked_me(${X})`]!;
    expect(lesson.supportingEpisodeIds).toHaveLength(5);
    expect(lesson.supportingEpisodeIds).toEqual([
      'event_0008_00000',
      'event_0007_00000',
      'event_0006_00000',
      'event_0005_00000',
      'event_0004_00000',
    ]);
  });

  it('behaelt firstLearnedRound aus einer bestehenden Lesson bei, aktualisiert lastUpdated', () => {
    const episodic = [
      episode({ id: 'event_0001_00000' as EpisodicMemory['id'], eventType: 'agent_attacked', role: 'target', participants: [SELF, X].sort() }),
    ];
    const existing: Record<string, Lesson> = {
      [`attacked_me(${X})`]: {
        key: `attacked_me(${X})`,
        scope: 'about_agent',
        subjectRef: X,
        statement: 'alt',
        confidence: 0.5,
        evidenceCount: 0,
        contradictoryEvidence: 0,
        supportingEpisodeIds: ['event_0000_00000' as EpisodicMemory['id']],
        firstLearnedRound: 3,
        lastUpdated: 3,
        persistAcrossMatches: false,
      },
    };
    const { lessons } = mineLessons(agentWith(episodic, existing), 9, nameOf, 20, 30);
    const lesson = lessons[`attacked_me(${X})`]!;
    expect(lesson.firstLearnedRound).toBe(3);
    expect(lesson.lastUpdated).toBe(9);
  });

  it('deckelt auf maxLessons — die am staerksten belegten bleiben', () => {
    const agents: AgentId[] = Array.from({ length: 5 }, (_, i) => `agent_${String(i + 10).padStart(3, '0')}` as AgentId);
    const episodic: EpisodicMemory[] = [];
    let seq = 0;
    agents.forEach((other, index) => {
      // agent_010 bekommt 3 Belege, agent_011 bekommt 2, ..., agent_014 bekommt 0 (kein Eintrag).
      const count = 3 - index;
      for (let i = 0; i < count; i += 1) {
        episodic.push(
          episode({
            id: `event_${String(++seq).padStart(4, '0')}_00000` as EpisodicMemory['id'],
            eventType: 'agent_attacked' as EventType,
            role: 'target',
            participants: [SELF, other].sort(),
          }),
        );
      }
    });
    const { lessons } = mineLessons(agentWith(episodic), 5, nameOf, 20, 2);
    expect(Object.keys(lessons)).toHaveLength(2);
    expect(lessons[`attacked_me(${agents[0]})`]).toBeDefined();
    expect(lessons[`attacked_me(${agents[1]})`]).toBeDefined();
    expect(lessons[`attacked_me(${agents[3]})`]).toBeUndefined();
  });
});
