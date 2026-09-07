import { describe, expect, it } from 'vitest';

import { MAX_REVIEW_ROUNDS } from '@/review/contract.js';
import { decideNextAction, detectTestWeakening, isBlockedOnHuman } from '@/review/loop.js';
import type { LoopInput } from '@/review/loop.js';
import {
  completedRounds,
  finding,
  fixRecord,
  okAttempt,
  rejection,
  round,
  testRun,
  unusableAttempt,
  verdict,
} from '../fixtures/review.js';

function input(overrides: Partial<LoopInput> = {}): LoopInput {
  return { rounds: [], ci: 'passing', baseline_test_run: testRun(), ...overrides };
}

describe('Start und regulaerer Verlauf', () => {
  it('beginnt mit Runde 1', () => {
    expect(decideNextAction(input())).toEqual({ type: 'REQUEST_REVIEW', round: 1, attempt: 1 });
  });

  it('verlangt nach Findings eine Fix-Runde', () => {
    const action = decideNextAction(
      input({ rounds: [round({ review_attempts: [okAttempt([finding()])], fix: null })] }),
    );
    expect(action.type).toBe('APPLY_FIXES');
    if (action.type === 'APPLY_FIXES') {
      expect(action.actionable.map((entry) => entry.finding_id)).toEqual(['ARCH-001']);
    }
  });

  it('startet nach erfolgreicher Fix-Runde die naechste Review-Runde', () => {
    expect(decideNextAction(input({ rounds: completedRounds(1) }))).toEqual({
      type: 'REQUEST_REVIEW',
      round: 2,
      attempt: 1,
    });
  });
});

describe('AI liefert keine Findings', () => {
  it('meldet den PR als bereit fuer die menschliche Pruefung — nie als gemerged', () => {
    const rounds = [round({ review_attempts: [okAttempt([])], fix: null })];
    expect(decideNextAction(input({ rounds }))).toEqual({ type: 'READY_FOR_HUMAN_MERGE' });
  });

  it('wartet auf die CI, wenn ihr Ergebnis offen ist', () => {
    const rounds = [round({ review_attempts: [okAttempt([])], fix: null })];
    expect(decideNextAction(input({ rounds, ci: 'unknown' }))).toEqual({ type: 'WAIT_FOR_CI', round: 1 });
  });

  it('verlangt bei roter CI eine Reparatur, auch ohne Findings', () => {
    const rounds = [round({ review_attempts: [okAttempt([])], fix: null })];
    expect(decideNextAction(input({ rounds, ci: 'failing' }))).toEqual({ type: 'FIX_FAILING_TESTS', round: 1 });
  });
});

describe('Beschaedigte AI-Antwort', () => {
  it('fragt genau einmal neu an', () => {
    const rounds = [round({ review_attempts: [unusableAttempt()], fix: null })];
    expect(decideNextAction(input({ rounds }))).toEqual({ type: 'REQUEST_REVIEW', round: 1, attempt: 2 });
  });

  it('eskaliert, wenn der Reviewer zweimal unbrauchbar antwortet', () => {
    const rounds = [round({ review_attempts: [unusableAttempt(), unusableAttempt()], fix: null })];
    const action = decideNextAction(input({ rounds }));
    expect(action.type).toBe('HUMAN_REVIEW_REQUIRED');
    if (action.type === 'HUMAN_REVIEW_REQUIRED') expect(action.reason).toBe('reviewer_response_unusable');
  });
});

describe('Fehlgeschlagene Tests', () => {
  it('verlangt Reparatur statt einer neuen Review-Runde', () => {
    const rounds = [
      round({ fix: fixRecord({ test_run: testRun({ exit_code: 1, total: 50, passed: 49, failed: 1 }) }) }),
    ];
    expect(decideNextAction(input({ rounds }))).toEqual({ type: 'FIX_FAILING_TESTS', round: 1 });
  });

  it('erkennt auch einen roten Exitcode ohne fehlgeschlagenen Test', () => {
    const rounds = [round({ fix: fixRecord({ test_run: testRun({ exit_code: 1 }) }) })];
    expect(decideNextAction(input({ rounds }))).toEqual({ type: 'FIX_FAILING_TESTS', round: 1 });
  });
});

describe('Tests duerfen nicht stillgelegt werden', () => {
  it('erkennt zusaetzlich uebersprungene Tests', () => {
    expect(detectTestWeakening(testRun(), testRun({ passed: 49, skipped: 1 }))).toMatch(/Uebersprungene/);
  });

  it('erkennt verschwundene Tests', () => {
    expect(detectTestWeakening(testRun(), testRun({ total: 49, passed: 49 }))).toMatch(/gesunken/);
  });

  it('meldet nichts, wenn Tests dazukommen', () => {
    expect(detectTestWeakening(testRun(), testRun({ total: 55, passed: 55 }))).toBeNull();
  });

  it('eskaliert eine Fix-Runde, die Tests uebersprungen hat', () => {
    const rounds = [round({ fix: fixRecord({ test_run: testRun({ passed: 49, skipped: 1 }) }) })];
    const action = decideNextAction(input({ rounds }));
    expect(action.type).toBe('HUMAN_REVIEW_REQUIRED');
    if (action.type === 'HUMAN_REVIEW_REQUIRED') {
      expect(action.reason).toBe('test_weakening');
      expect(isBlockedOnHuman(action)).toBe(true);
    }
  });

  it('vergleicht ueber Runden hinweg mit der letzten Fix-Runde', () => {
    const first = round({ round: 1, fix: fixRecord({ test_run: testRun({ total: 60, passed: 60 }) }) });
    const second = round({
      round: 2,
      review_attempts: [okAttempt([finding({ finding_id: 'ARCH-002' })])],
      fix: fixRecord({
        verdicts: [verdict({ finding_id: 'ARCH-002' })],
        test_run: testRun({ total: 58, passed: 58 }),
      }),
    });
    const action = decideNextAction(input({ rounds: [first, second] }));
    expect(action.type).toBe('HUMAN_REVIEW_REQUIRED');
    if (action.type === 'HUMAN_REVIEW_REQUIRED') expect(action.reason).toBe('test_weakening');
  });
});

describe('Abgelehnte Findings', () => {
  it('laesst ein begruendet abgelehntes MEDIUM-Finding den Loop fortsetzen', () => {
    const rounds = [
      round({
        review_attempts: [okAttempt([finding({ severity: 'MEDIUM' })])],
        fix: fixRecord({ verdicts: [rejection()], changed_files: [] }),
      }),
    ];
    expect(decideNextAction(input({ rounds }))).toEqual({ type: 'REQUEST_REVIEW', round: 2, attempt: 1 });
  });

  it('eskaliert ein abgelehntes CRITICAL-Finding an einen Menschen', () => {
    const rounds = [
      round({
        review_attempts: [okAttempt([finding({ finding_id: 'SEC-001', severity: 'CRITICAL' })])],
        fix: fixRecord({ verdicts: [rejection({ finding_id: 'SEC-001' })], changed_files: [] }),
      }),
    ];
    const action = decideNextAction(input({ rounds }));
    expect(action.type).toBe('HUMAN_REVIEW_REQUIRED');
    if (action.type === 'HUMAN_REVIEW_REQUIRED') expect(action.reason).toBe('high_severity_finding_rejected');
  });

  it('eskaliert, wenn ein Finding gar kein Urteil bekommen hat', () => {
    const rounds = [
      round({
        review_attempts: [okAttempt([finding({ finding_id: 'ARCH-001' }), finding({ finding_id: 'ARCH-002' })])],
        fix: fixRecord({ verdicts: [verdict({ finding_id: 'ARCH-001' })] }),
      }),
    ];
    const action = decideNextAction(input({ rounds }));
    expect(action.type).toBe('HUMAN_REVIEW_REQUIRED');
    if (action.type === 'HUMAN_REVIEW_REQUIRED') {
      expect(action.reason).toBe('verdicts_incomplete');
      expect(action.detail).toMatch(/ARCH-002/);
    }
  });
});

describe('MAX_REVIEW_ROUNDS', () => {
  it('steht auf 3', () => {
    expect(MAX_REVIEW_ROUNDS).toBe(3);
  });

  it('uebergibt nach der dritten abgeschlossenen Runde an einen Menschen', () => {
    const action = decideNextAction(input({ rounds: completedRounds(MAX_REVIEW_ROUNDS) }));
    expect(action.type).toBe('HUMAN_REVIEW_REQUIRED');
    if (action.type === 'HUMAN_REVIEW_REQUIRED') expect(action.reason).toBe('max_review_rounds_reached');
  });

  it('startet vor der dritten Runde noch selbstaendig weiter', () => {
    expect(decideNextAction(input({ rounds: completedRounds(2) })).type).toBe('REQUEST_REVIEW');
  });

  it('startet auch bei roten Tests keine vierte Runde', () => {
    const rounds = completedRounds(MAX_REVIEW_ROUNDS);
    const last = rounds.at(-1);
    if (last?.fix != null) last.fix.test_run = testRun({ exit_code: 1, passed: 49, failed: 1 });
    const action = decideNextAction(input({ rounds }));
    expect(action.type).toBe('HUMAN_REVIEW_REQUIRED');
  });

  it('kann in keinem Zustand ein Zusammenfuehren nach main veranlassen', () => {
    const zustaende: LoopInput[] = [
      input(),
      input({ rounds: completedRounds(1) }),
      input({ rounds: completedRounds(MAX_REVIEW_ROUNDS) }),
      input({ rounds: [round({ review_attempts: [okAttempt([])], fix: null })] }),
      input({ rounds: [round({ review_attempts: [unusableAttempt(), unusableAttempt()], fix: null })] }),
    ];
    for (const zustand of zustaende) {
      const action = decideNextAction(zustand);
      expect(action.type).not.toBe('MERGE');
      expect(Object.values(action)).not.toContain('merge');
    }
  });
});
