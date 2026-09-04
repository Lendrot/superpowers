import { beforeEach, describe, expect, it } from 'vitest';

import { resolveConfig } from '@/engine/core/config.js';
import { InvariantError, assertInvariants } from '@/engine/core/invariants.js';
import type { AgentId, EpisodicMemory, EventId, WorldState } from '@/engine/core/types.js';
import { effect } from '@/engine/mutation/effects.js';
import { applyEffects } from '@/engine/mutation/stateMutator.js';
import { initWorld } from '@/engine/world/initWorld.js';

const A: AgentId = 'agent_000';
const B: AgentId = 'agent_001';

let state: WorldState;

beforeEach(() => {
  state = initWorld(resolveConfig({ seed: 1, agentCount: 4 })).state;
  // Definierter Ausgangspunkt, damit die Erwartungen nicht an gezogenen Werten haengen.
  state.agents[A]!.resources = { food: 10, coins: 10, materials: 5 };
  state.agents[A]!.needs = { satiety: 50, energy: 50 };
  state.agents[A]!.location = 'commons';
  state.locations['commons']!.stock = { food: 10, coins: 0, materials: 4 };
});

describe('stateMutator — Effekttypen', () => {
  it('resource: addiert und subtrahiert', () => {
    applyEffects(state, [effect.resource(A, { food: 5, materials: -2 })]);
    expect(state.agents[A]!.resources).toEqual({ food: 15, coins: 10, materials: 3 });
  });

  it('resource: wirft, statt ins Minus zu laufen', () => {
    expect(() => applyEffects(state, [effect.resource(A, { food: -11 })])).toThrow(InvariantError);
  });

  it('resource: wirft bei nicht ganzzahligen Deltas', () => {
    expect(() => applyEffects(state, [effect.resource(A, { food: 1.5 })])).toThrow(InvariantError);
  });

  it('need: kappt auf 0..100, statt zu werfen', () => {
    applyEffects(state, [effect.need(A, { energy: 80, satiety: -80 })]);
    expect(state.agents[A]!.needs).toEqual({ satiety: 0, energy: 100 });
  });

  it('location_stock: verschiebt Bestand', () => {
    applyEffects(state, [
      effect.locationStock('commons', { food: -4 }, 'transfer'),
      effect.resource(A, { food: 4 }),
    ]);
    expect(state.locations['commons']!.stock.food).toBe(6);
    expect(state.agents[A]!.resources.food).toBe(14);
  });

  it('location_stock: wirft ueber der Kapazitaet', () => {
    const capacity = state.locations['commons']!.capacity.food;
    expect(() =>
      applyEffects(state, [effect.locationStock('commons', { food: capacity }, 'regen')]),
    ).toThrow(InvariantError);
  });

  it('status: setzt Zaehler', () => {
    applyEffects(state, [effect.status(A, { hungerStreak: 3 })]);
    expect(state.agents[A]!.status.hungerStreak).toBe(3);
  });

  it('move: setzt den Ort', () => {
    applyEffects(state, [effect.move(A, 'fields')]);
    expect(state.agents[A]!.location).toBe('fields');
  });

  it('eliminate: setzt alive, Runde und Ursache', () => {
    applyEffects(state, [effect.eliminate(B, 'starvation')]);
    expect(state.agents[B]!.alive).toBe(false);
    expect(state.agents[B]!.eliminatedRound).toBe(state.round);
    expect(state.agents[B]!.eliminationCause).toBe('starvation');
  });

  it('eliminate: wirft beim zweiten Mal', () => {
    applyEffects(state, [effect.eliminate(B, 'starvation')]);
    expect(() => applyEffects(state, [effect.eliminate(B, 'exile')])).toThrow(InvariantError);
  });

  it('round_advance und match_end', () => {
    applyEffects(state, [effect.roundAdvance()]);
    expect(state.round).toBe(2);
    applyEffects(state, [effect.matchEnd('round_limit')]);
    expect(state.status).toBe('finished');
    expect(state.endReason).toBe('round_limit');
  });
});

function episode(id: string, salience: number): EpisodicMemory {
  return {
    id: id as EventId,
    round: 1,
    eventType: 'trade_accepted',
    participants: [A],
    role: 'actor',
    valence: 0.2,
    salience,
    summaryKey: `trade_accepted:${id}`,
  };
}

describe('stateMutator — Episoden (T22)', () => {
  it('episode_add haengt an, episode_upkeep laesst die Salience verfallen', () => {
    applyEffects(state, [effect.episodeAdd(A, episode('event_0001_00000', 0.5))]);
    expect(state.agents[A]!.episodic).toHaveLength(1);

    applyEffects(state, [effect.episodeUpkeep(A)]);
    expect(state.agents[A]!.episodic[0]!.salience).toBeCloseTo(0.5 * (1 - state.config.memory.salienceDecay));
  });

  it('kompaktiert die untersten 20 % nach Salience, sobald maxEpisodes ueberschritten ist', () => {
    const withCap = initWorld(
      resolveConfig({ seed: 1, agentCount: 4, memory: { maxEpisodes: 10, compactionThreshold: 0.2 } }),
    ).state;
    const adds = Array.from({ length: 11 }, (_, i) =>
      effect.episodeAdd(A, episode(`event_0001_${String(i).padStart(5, '0')}`, i / 10)),
    );
    applyEffects(withCap, adds);
    expect(withCap.agents[A]!.episodic).toHaveLength(11);

    applyEffects(withCap, [effect.episodeUpkeep(A)]);
    // 11 Episoden, Schwelle 20 % -> round(11*0.2) = 2 entfernt, 9 bleiben.
    expect(withCap.agents[A]!.episodic).toHaveLength(9);
    // Die niedrigsten Salience-Werte (0.0, 0.1 vor Verfall) sind weg — die
    // verbleibenden sind alle hoeher als die zwei entfernten waren.
    const remainingIds = withCap.agents[A]!.episodic.map((e) => e.id).sort();
    expect(remainingIds).not.toContain('event_0001_00000');
    expect(remainingIds).not.toContain('event_0001_00001');
  });

  it('lehnt episode_add fuer eine unbekannte doppelte EventId ab', () => {
    applyEffects(state, [effect.episodeAdd(A, episode('event_0001_00000', 0.3))]);
    expect(() => applyEffects(state, [effect.episodeAdd(A, episode('event_0001_00000', 0.9))])).toThrow(
      InvariantError,
    );
  });
});

describe('stateMutator — Lessons (T24)', () => {
  function lesson(key: string, supportingEpisodeIds: EventId[]) {
    return {
      key,
      scope: 'about_agent' as const,
      subjectRef: B,
      statement: 'Testaussage.',
      confidence: 0.75,
      evidenceCount: 2,
      contradictoryEvidence: 0,
      supportingEpisodeIds,
      firstLearnedRound: 1,
      lastUpdated: 1,
      persistAcrossMatches: false,
    };
  }

  it('lesson_sync ersetzt den Lesson-Bestand, wenn alle Belege im eigenen episodic stehen', () => {
    applyEffects(state, [effect.episodeAdd(A, episode('event_0001_00000', 0.5))]);
    const key = `attacked_me(${B})`;
    applyEffects(state, [effect.lessonSync(A, { [key]: lesson(key, ['event_0001_00000' as EventId]) })]);
    expect(state.agents[A]!.lessons[key]).toMatchObject({ key, subjectRef: B });
  });

  it('lehnt eine Lesson ab, deren Beleg nicht im eigenen episodic steht (CLAUDE.md Regel 8)', () => {
    const key = `attacked_me(${B})`;
    expect(() =>
      applyEffects(state, [effect.lessonSync(A, { [key]: lesson(key, ['event_9999_00000' as EventId]) })]),
    ).toThrow(/nicht in agent_000s episodic/);
  });

  it('lehnt eine Lesson ohne supportingEpisodeIds ab', () => {
    const key = `attacked_me(${B})`;
    expect(() => applyEffects(state, [effect.lessonSync(A, { [key]: lesson(key, []) })])).toThrow(InvariantError);
  });

  it('lehnt mehr Lessons ab, als config.learning.maxLessons erlaubt', () => {
    applyEffects(state, [effect.episodeAdd(A, episode('event_0001_00000', 0.5))]);
    const withCap = state.config.learning.maxLessons;
    const lessons: Record<string, ReturnType<typeof lesson>> = {};
    for (let i = 0; i <= withCap; i += 1) {
      const key = `attacked_me(agent_${String(i + 100).padStart(3, '0')})`;
      lessons[key] = lesson(key, ['event_0001_00000' as EventId]);
    }
    expect(() => applyEffects(state, [effect.lessonSync(A, lessons)])).toThrow(/maxLessons/);
  });
});

describe('stateMutator — ausgeschiedene Agenten', () => {
  it('nimmt keine Effekte fuer ausgeschiedene Agenten an', () => {
    applyEffects(state, [effect.eliminate(B, 'starvation')]);
    expect(() => applyEffects(state, [effect.resource(B, { food: 1 })])).toThrow(InvariantError);
    expect(() => applyEffects(state, [effect.move(B, 'fields')])).toThrow(InvariantError);
  });
});

describe('stateMutator — Erhaltung', () => {
  it('akzeptiert eine reine Verschiebung', () => {
    expect(() =>
      applyEffects(state, [
        effect.locationStock('commons', { food: -3 }, 'transfer'),
        effect.resource(A, { food: 3 }),
      ]),
    ).not.toThrow();
  });

  it('akzeptiert eine deklarierte Quelle', () => {
    expect(() => applyEffects(state, [effect.locationStock('commons', { food: 2 }, 'regen')])).not.toThrow();
  });

  it('entdeckt eine Aenderung, die zwischen zwei Batches am Mutator vorbei geschrieben wurde', () => {
    // Genau der Fehler, den Regel 1 verhindern soll: irgendwo im Code greift
    // jemand direkt auf den State zu. Der naechste Batch faellt darueber.
    applyEffects(state, [effect.need(A, { energy: 1 })]);
    state.agents[A]!.resources.coins += 7;
    expect(() => applyEffects(state, [effect.need(A, { energy: 1 })])).toThrow(/vorbei geschrieben/);
  });

  it('merkt sich den Bestand ueber mehrere Batches hinweg korrekt', () => {
    for (let i = 0; i < 5; i += 1) {
      applyEffects(state, [
        effect.locationStock('commons', { food: -1 }, 'transfer'),
        effect.resource(A, { food: 1 }),
      ]);
    }
    expect(state.agents[A]!.resources.food).toBe(15);
    expect(state.locations['commons']!.stock.food).toBe(5);
  });
});

describe('assertInvariants', () => {
  it('haelt eine frische Welt fuer gueltig', () => {
    expect(() => assertInvariants(state)).not.toThrow();
  });

  it('faellt ueber negative Ressourcen', () => {
    state.agents[A]!.resources.food = -1;
    expect(() => assertInvariants(state)).toThrow(InvariantError);
  });

  it('faellt ueber Stats ausserhalb 0..100', () => {
    state.agents[A]!.needs.energy = 101;
    expect(() => assertInvariants(state)).toThrow(InvariantError);
  });

  it('faellt ueber einen Bestand ueber der Kapazitaet', () => {
    state.locations['commons']!.stock.food = state.locations['commons']!.capacity.food + 1;
    expect(() => assertInvariants(state)).toThrow(InvariantError);
  });

  it('faellt ueber einen ausgeschiedenen Agenten ohne Ursache', () => {
    state.agents[A]!.alive = false;
    expect(() => assertInvariants(state)).toThrow(InvariantError);
  });

  it('faellt ueber einen einseitigen Ortsgraphen', () => {
    state.locations['commons']!.neighbors = ['outskirts'];
    expect(() => assertInvariants(state)).toThrow(InvariantError);
  });
});
