import { describe, expect, it } from 'vitest';

import type { AgentId, MatchId, WorldEvent } from '@/engine/index.js';
import { resolveConfig } from '@/engine/index.js';
import { openDatabase } from '@/persistence/db.js';
import { appendEvents, loadEventDrafts } from '@/persistence/repositories/eventLog.js';
import { getMatch, insertMatch, updateMatchStatus } from '@/persistence/repositories/matches.js';
import { loadLatestSnapshot, loadSnapshot, saveSnapshot } from '@/persistence/repositories/snapshots.js';
import { initWorld } from '@/engine/index.js';

const MATCH_ID = 'match_test_0001' as MatchId;
const CONFIG = resolveConfig({ seed: 3, agentCount: 4 });

/** `event_log`/`snapshots` tragen ein Fremdschluessel auf `matches(id)` — eine Zeile muss zuerst existieren. */
function seedMatchRow(db: ReturnType<typeof openDatabase>): void {
  insertMatch(db, {
    id: MATCH_ID,
    seed: CONFIG.seed,
    config: CONFIG,
    startedAt: '2026-01-01T00:00:00.000Z',
    status: 'running',
    mode: 'headless',
  });
}

describe('persistence/db — Schema', () => {
  it('legt alle sieben Tabellen aus Doc 02 §2.5 an', () => {
    const db = openDatabase(':memory:');
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).toEqual([
      'decision_traces',
      'event_log',
      'llm_calls',
      'matches',
      'persistent_lessons',
      'sim_runs',
      'snapshots',
    ]);
    db.close();
  });

  it('ist wiederholt oeffnenbar, ohne zu werfen (CREATE TABLE IF NOT EXISTS)', () => {
    const db = openDatabase(':memory:');
    expect(() => openDatabase(':memory:')).not.toThrow();
    db.close();
  });
});

describe('persistence/repositories/matches', () => {
  it('schreibt und liest eine Match-Zeile', () => {
    const db = openDatabase(':memory:');
    insertMatch(db, {
      id: MATCH_ID,
      seed: CONFIG.seed,
      config: CONFIG,
      startedAt: '2026-01-01T00:00:00.000Z',
      status: 'running',
      mode: 'headless',
    });

    const row = getMatch(db, MATCH_ID);
    expect(row?.seed).toBe(CONFIG.seed);
    expect(row?.status).toBe('running');
    expect(row?.config).toEqual(CONFIG);

    updateMatchStatus(db, MATCH_ID, { status: 'finished', endedAt: '2026-01-01T00:05:00.000Z' });
    expect(getMatch(db, MATCH_ID)?.status).toBe('finished');
    expect(getMatch(db, MATCH_ID)?.endedAt).toBe('2026-01-01T00:05:00.000Z');

    db.close();
  });

  it('liefert undefined fuer eine unbekannte MatchId', () => {
    const db = openDatabase(':memory:');
    expect(getMatch(db, 'match_unbekannt' as MatchId)).toBeUndefined();
    db.close();
  });
});

describe('persistence/repositories/eventLog', () => {
  it('rekonstruiert Events verlustfrei, inklusive optionaler Felder', () => {
    const db = openDatabase(':memory:');
    seedMatchRow(db);
    const A: AgentId = 'agent_000';
    const B: AgentId = 'agent_001';
    const events: WorldEvent[] = [
      {
        id: 'event_0001_00000',
        matchId: MATCH_ID,
        round: 1,
        seq: 0,
        type: 'round_started',
        locationId: null,
        payload: { alive: 4 },
        visibility: { scope: 'public' },
        infoRefs: [],
      },
      {
        id: 'event_0001_00001',
        matchId: MATCH_ID,
        round: 1,
        seq: 1,
        type: 'agent_attacked',
        actorId: A,
        targetId: B,
        locationId: 'commons',
        payload: { damage: 5 },
        visibility: { scope: 'location', locationId: 'commons' },
        infoRefs: ['info_attr_agent_000_strength' as never],
      },
    ];

    appendEvents(db, MATCH_ID, events);
    const drafts = loadEventDrafts(db, MATCH_ID);

    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({ round: 1, type: 'round_started', locationId: null, payload: { alive: 4 } });
    expect(drafts[1]).toMatchObject({
      round: 1,
      type: 'agent_attacked',
      actorId: A,
      targetId: B,
      locationId: 'commons',
      payload: { damage: 5 },
      infoRefs: ['info_attr_agent_000_strength'],
    });
    // Keine Allianz beteiligt — das Feld darf nicht als leerer String zurueckkommen.
    expect(drafts[1]?.allianceId).toBeUndefined();

    db.close();
  });

  it('ist ein no-op bei einer leeren Liste', () => {
    const db = openDatabase(':memory:');
    expect(() => appendEvents(db, MATCH_ID, [])).not.toThrow();
    expect(loadEventDrafts(db, MATCH_ID)).toEqual([]);
    db.close();
  });
});

describe('persistence/repositories/snapshots', () => {
  it('speichert den RNG-Stand live, nicht den aus initWorld', () => {
    const db = openDatabase(':memory:');
    seedMatchRow(db);
    const { state, rng } = initWorld(CONFIG);
    // Ein paar Zuege, damit sich der Zaehlerstand vom Initialwert unterscheidet.
    rng.stream('probe').next();
    rng.stream('probe').next();
    const liveRngState = rng.snapshot();

    saveSnapshot(db, MATCH_ID, state.round, state, liveRngState);
    const loaded = loadLatestSnapshot(db, MATCH_ID);

    expect(loaded?.state.rngState).toEqual(liveRngState);
    expect(loaded?.state.rngState).not.toEqual(state.rngState);

    db.close();
  });

  it('lehnt einen manipulierten Snapshot ab (state_hash passt nicht mehr)', () => {
    const db = openDatabase(':memory:');
    seedMatchRow(db);
    const { state, rng } = initWorld(CONFIG);
    saveSnapshot(db, MATCH_ID, state.round, state, rng.snapshot());

    db.prepare(`UPDATE snapshots SET state_json = replace(state_json, '"round":1', '"round":2') WHERE match_id = ?`).run(
      MATCH_ID,
    );

    expect(() => loadLatestSnapshot(db, MATCH_ID)).toThrow(/beschaedigt/);
    db.close();
  });

  it('ueberschreibt einen Snapshot derselben Runde, statt zu duplizieren', () => {
    const db = openDatabase(':memory:');
    seedMatchRow(db);
    const { state, rng } = initWorld(CONFIG);
    saveSnapshot(db, MATCH_ID, state.round, state, rng.snapshot());
    saveSnapshot(db, MATCH_ID, state.round, state, rng.snapshot());

    const count = db.prepare(`SELECT COUNT(*) AS n FROM snapshots WHERE match_id = ?`).get(MATCH_ID) as { n: number };
    expect(count.n).toBe(1);
    db.close();
  });

  it('loadSnapshot findet eine bestimmte Runde, loadLatestSnapshot die juengste', () => {
    const db = openDatabase(':memory:');
    seedMatchRow(db);
    const { state, rng } = initWorld(CONFIG);
    saveSnapshot(db, MATCH_ID, 1, state, rng.snapshot());
    saveSnapshot(db, MATCH_ID, 5, { ...state, round: 5 }, rng.snapshot());

    expect(loadSnapshot(db, MATCH_ID, 1)?.round).toBe(1);
    expect(loadLatestSnapshot(db, MATCH_ID)?.round).toBe(5);
    db.close();
  });
});
