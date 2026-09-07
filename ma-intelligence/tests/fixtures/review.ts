/**
 * Bausteine fuer die Review-Loop-Tests. Alle Findings hier sind erfunden.
 */

import { REVIEW_CONTRACT_VERSION } from '@/review/contract.js';
import type { Finding } from '@/review/findings.js';
import type { ReviewRequest, TestRun } from '@/review/request.js';
import type { FixRecord, ReviewAttempt, RoundRecord } from '@/review/rounds.js';
import type { Verdict } from '@/review/verdicts.js';

export const NOW = '2026-09-07T12:00:00.000Z';

export function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    finding_id: 'ARCH-001',
    severity: 'MEDIUM',
    category: 'architecture',
    file: 'src/domain/entities.ts',
    lines: '20-35',
    problem: 'Das Schema laesst einen Deal ohne Quelle zu.',
    evidence: 'source_ids ist in Zeile 24 ein Array ohne Mindestlaenge.',
    required_change: 'Regel in die Pipeline aufnehmen und dort pruefen.',
    acceptance_criteria: ['Ein Deal ohne Quelle wird abgelehnt.'],
    confidence: 0.9,
    ...overrides,
  };
}

export function payload(findings: readonly Finding[]): string {
  return JSON.stringify({ contract_version: REVIEW_CONTRACT_VERSION, findings });
}

export function testRun(overrides: Partial<TestRun> = {}): TestRun {
  return { command: 'pnpm test', exit_code: 0, total: 50, passed: 50, failed: 0, skipped: 0, ...overrides };
}

export function verdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    finding_id: 'ARCH-001',
    decision: 'ACCEPTED',
    rationale: 'Der Befund stimmt, die Regel fehlte tatsaechlich in der Pipeline.',
    changed_files: ['src/ingest/rules.ts'],
    tests: ['tests/unit/rules.test.ts'],
    ...overrides,
  };
}

export function rejection(overrides: Partial<Verdict> = {}): Verdict {
  return verdict({
    decision: 'REJECTED',
    rationale: 'Die Regel steht bereits in dealSchema Zeile 180 und ist dort getestet.',
    changed_files: [],
    tests: [],
    ...overrides,
  });
}

export function okAttempt(findings: readonly Finding[]): ReviewAttempt {
  return {
    status: 'ok',
    provider_id: 'mock',
    provider_status: 'mock',
    received_at: NOW,
    findings: [...findings],
  };
}

export function unusableAttempt(error = 'Antwort ist kein JSON'): ReviewAttempt {
  return {
    status: 'unusable',
    provider_id: 'mock',
    provider_status: 'mock',
    received_at: NOW,
    error,
    raw_excerpt: '{"findings": [',
  };
}

export function fixRecord(overrides: Partial<FixRecord> = {}): FixRecord {
  return {
    completed_at: NOW,
    verdicts: [verdict()],
    changed_files: ['src/ingest/rules.ts'],
    test_run: testRun(),
    remaining_risks: [],
    ...overrides,
  };
}

export function round(overrides: Partial<RoundRecord> = {}): RoundRecord {
  return { round: 1, review_attempts: [okAttempt([finding()])], fix: fixRecord(), ...overrides };
}

/** Volle Runden 1..n, jeweils Review mit einem Finding und angenommenem Fix. */
export function completedRounds(count: number): RoundRecord[] {
  return Array.from({ length: count }, (_unused, index) =>
    round({
      round: index + 1,
      review_attempts: [okAttempt([finding({ finding_id: `ARCH-00${index + 1}` })])],
      fix: fixRecord({ verdicts: [verdict({ finding_id: `ARCH-00${index + 1}` })] }),
    }),
  );
}

export function reviewRequest(overrides: Partial<ReviewRequest> = {}): ReviewRequest {
  return {
    contract_version: REVIEW_CONTRACT_VERSION,
    round: 1,
    pull_request: {
      repository: 'Lendrot/superpowers',
      number: 2,
      title: 'Beispiel-PR',
      base_branch: 'main',
      head_branch: 'claude/beispiel',
      head_sha: 'abc1234',
    },
    diff: 'diff --git a/src/x.ts b/src/x.ts',
    changed_files: ['src/x.ts'],
    test_files: ['tests/unit/x.test.ts'],
    documents: [{ path: 'docs/architecture.md', content: '# Architektur' }],
    ci: {
      status: 'passing',
      checks: [{ name: 'check', conclusion: 'success' }],
      test_run: testRun(),
    },
    previous_rounds: [],
    ...overrides,
  };
}
