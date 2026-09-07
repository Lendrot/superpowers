import { describe, expect, it } from 'vitest';

import { renderAuditTrail } from '@/review/audit.js';
import { REVIEW_CONTRACT_VERSION } from '@/review/contract.js';
import { decideNextAction } from '@/review/loop.js';
import type { AuditTrail } from '@/review/rounds.js';
import { auditTrailSchema } from '@/review/rounds.js';
import {
  completedRounds,
  finding,
  fixRecord,
  okAttempt,
  rejection,
  round,
  testRun,
  unusableAttempt,
} from '../fixtures/review.js';

function trail(rounds: AuditTrail['rounds']): AuditTrail {
  return {
    contract_version: REVIEW_CONTRACT_VERSION,
    pull_request: { repository: 'Lendrot/superpowers', number: 2 },
    rounds,
  };
}

function render(rounds: AuditTrail['rounds'], ci: 'passing' | 'failing' | 'unknown' = 'passing'): string {
  const record = trail(rounds);
  return renderAuditTrail(record, decideNextAction({ rounds, ci, baseline_test_run: testRun() }));
}

describe('auditTrailSchema', () => {
  it('verlangt luecken- und sprungfreie Rundennummern', () => {
    expect(auditTrailSchema.safeParse(trail(completedRounds(3))).success).toBe(true);
    const broken = completedRounds(2);
    const second = broken[1];
    if (second !== undefined) second.round = 3;
    expect(auditTrailSchema.safeParse(trail(broken)).success).toBe(false);
  });
});

describe('renderAuditTrail', () => {
  it('benennt jede Runde als review-N und fix-N', () => {
    const markdown = render(completedRounds(3));
    for (const round_ of [1, 2, 3]) {
      expect(markdown).toContain(`### review-${round_}`);
      expect(markdown).toContain(`### fix-${round_}`);
    }
  });

  it('zeigt abgelehnte Findings mit Begruendung — sie verschwinden nicht', () => {
    const markdown = render([
      round({
        review_attempts: [okAttempt([finding({ finding_id: 'MED-001', severity: 'MEDIUM' })])],
        fix: fixRecord({
          verdicts: [rejection({ finding_id: 'MED-001', rationale: 'Die Regel steht bereits in dealSchema.' })],
          changed_files: [],
        }),
      }),
    ]);
    expect(markdown).toContain('**Abgelehnt (1)**');
    expect(markdown).toContain('MED-001');
    expect(markdown).toContain('Die Regel steht bereits in dealSchema.');
  });

  it('markiert ein Mock-Review unuebersehbar', () => {
    const markdown = render(completedRounds(1));
    expect(markdown).toContain('[MOCK — kein echtes Modell]');
    expect(markdown).toContain('Mindestens ein Review stammt von einem Mock-Reviewer');
  });

  it('haelt Testergebnis und verbleibende Risiken fest', () => {
    const markdown = render([
      round({
        fix: fixRecord({
          test_run: testRun({ total: 60, passed: 60 }),
          remaining_risks: ['Die Pipeline prueft noch keine referentielle Integritaet.'],
        }),
      }),
    ]);
    expect(markdown).toContain('60/60 bestanden');
    expect(markdown).toContain('referentielle Integritaet');
  });

  it('schreibt die Eskalation samt Grund an den Anfang', () => {
    const markdown = render(completedRounds(3));
    expect(markdown).toContain('**HUMAN_REVIEW_REQUIRED**');
    expect(markdown).toContain('max_review_rounds_reached');
  });

  it('protokolliert eine unbrauchbare Antwort mit Auszug', () => {
    const markdown = render([round({ review_attempts: [unusableAttempt()], fix: null })]);
    expect(markdown).toContain('Antwort unbrauchbar');
    expect(markdown).toContain('{"findings": [');
  });

  it('sagt bei leerem Review, dass ein Mensch zusammenfuehrt', () => {
    const markdown = render([round({ review_attempts: [okAttempt([])], fix: null })]);
    expect(markdown).toContain('Keine Findings.');
    expect(markdown).toContain('entscheidet und macht ein Mensch');
  });
});
