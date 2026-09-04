import { describe, expect, it } from 'vitest';

import { canonicalJson, resolveConfig, runMatch } from '@/engine/index.js';
import { openDatabase } from '@/persistence/db.js';
import { runPersistedMatch, resumeMatch } from '@/persistence/persistMatch.js';
import { countEvents } from '@/persistence/repositories/eventLog.js';
import { getMatch } from '@/persistence/repositories/matches.js';
import { loadLatestSnapshot } from '@/persistence/repositories/snapshots.js';

/**
 * T27 — Abnahmekriterium aus Doc 11: "Resume aus Snapshot erzeugt
 * identischen Folgezustand". Der Beleg ist ein echter Vergleich, kein
 * Vertrauensvorschuss: derselbe Seed einmal ununterbrochen (`runMatch`,
 * bereits deterministisch bewiesen in `tests/golden/`) und einmal
 * unterbrochen + fortgesetzt (`runPersistedMatch` + `resumeMatch`) muessen
 * denselben `logHash` und denselben `WorldState` (bis auf keine Abweichung)
 * ergeben.
 */

const CONFIG = resolveConfig({ seed: 21, agentCount: 10, maxRounds: 40 });

describe('Persistenz — Resume erzeugt einen identischen Folgezustand', () => {
  it('liefert nach Unterbrechung + Resume denselben logHash und WorldState wie ein ununterbrochener Lauf', () => {
    const baseline = runMatch(CONFIG);

    const db = openDatabase(':memory:');
    const interrupted = runPersistedMatch(db, CONFIG, { maxRounds: 15, snapshotInterval: 6 });

    // Die Unterbrechung liegt echt mitten im Match, nicht zufaellig am Ende.
    expect(interrupted.state.status).toBe('running');
    expect(interrupted.rounds).toBe(15);

    const resumed = resumeMatch(db, interrupted.matchId);

    expect(resumed.state.status).toBe('finished');
    expect(resumed.logHash).toBe(baseline.logHash);
    expect(canonicalJson(resumed.state)).toBe(canonicalJson(baseline.state));
    expect(resumed.leaderboard).toEqual(baseline.leaderboard);

    db.close();
  });

  it('persistiert das Event-Log lueckenlos ueber die Unterbrechung hinweg', () => {
    const baseline = runMatch(CONFIG);

    const db = openDatabase(':memory:');
    const interrupted = runPersistedMatch(db, CONFIG, { maxRounds: 15, snapshotInterval: 6 });
    expect(countEvents(db, interrupted.matchId)).toBe(interrupted.events);

    const resumed = resumeMatch(db, interrupted.matchId);
    expect(countEvents(db, interrupted.matchId)).toBe(baseline.events);
    expect(resumed.events).toBe(baseline.events);

    db.close();
  });

  it('kann mehrfach unterbrochen und fortgesetzt werden — jedes Mal ab dem juengsten Snapshot', () => {
    const baseline = runMatch(CONFIG);

    const db = openDatabase(':memory:');
    const first = runPersistedMatch(db, CONFIG, { maxRounds: 10, snapshotInterval: 5 });
    const second = resumeMatch(db, first.matchId, { maxRounds: 10 });
    expect(second.state.status).toBe('running');
    const third = resumeMatch(db, first.matchId);

    expect(third.state.status).toBe('finished');
    expect(third.logHash).toBe(baseline.logHash);
    expect(canonicalJson(third.state)).toBe(canonicalJson(baseline.state));

    db.close();
  });

  it('schreibt eine matches-Zeile und aktualisiert deren Status bis "finished"', () => {
    const db = openDatabase(':memory:');
    const result = runPersistedMatch(db, CONFIG, { snapshotInterval: 10 });

    const row = getMatch(db, result.matchId);
    expect(row).toBeDefined();
    expect(row?.status).toBe('finished');
    expect(row?.endedAt).not.toBeNull();
    expect(row?.seed).toBe(CONFIG.seed);

    db.close();
  });

  it('haelt den letzten Snapshot konsistent zum tatsaechlichen Endzustand', () => {
    const db = openDatabase(':memory:');
    const result = runPersistedMatch(db, CONFIG, { snapshotInterval: 10 });

    const snapshot = loadLatestSnapshot(db, result.matchId);
    expect(snapshot).toBeDefined();
    expect(canonicalJson(snapshot?.state)).toBe(canonicalJson(result.state));

    db.close();
  });

  it('resumeMatch wirft, wenn kein Snapshot existiert', () => {
    const db = openDatabase(':memory:');
    expect(() => resumeMatch(db, 'match_does_not_exist' as never)).toThrow(/kein Snapshot/);
    db.close();
  });
});
