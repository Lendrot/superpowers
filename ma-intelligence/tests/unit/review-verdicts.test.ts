import { describe, expect, it } from 'vitest';

import { checkVerdictCompleteness, rejectedFindingsNeedingHuman, verdictSchema } from '@/review/verdicts.js';
import { finding, rejection, verdict } from '../fixtures/review.js';

describe('verdictSchema', () => {
  it('nimmt ein angenommenes Finding mit Aenderung und Test an', () => {
    expect(verdictSchema.parse(verdict())).toEqual(verdict());
  });

  it('nimmt ein abgelehntes Finding mit Begruendung an', () => {
    expect(verdictSchema.parse(rejection())).toEqual(rejection());
  });

  it('verlangt eine tragende Begruendung', () => {
    expect(verdictSchema.safeParse(verdict({ rationale: 'passt schon' })).success).toBe(false);
    expect(verdictSchema.safeParse(rejection({ rationale: 'nein' })).success).toBe(false);
  });

  it('laesst ein angenommenes Finding ohne Codeaenderung nicht durch', () => {
    expect(verdictSchema.safeParse(verdict({ changed_files: [] })).success).toBe(false);
  });

  it('laesst ein abgelehntes Finding keine Codeaenderung mitbringen', () => {
    expect(verdictSchema.safeParse(rejection({ changed_files: ['src/x.ts'] })).success).toBe(false);
  });
});

describe('checkVerdictCompleteness — abgelehnte Findings duerfen nicht verschwinden', () => {
  const findings = [finding({ finding_id: 'ARCH-001' }), finding({ finding_id: 'SEC-001', severity: 'HIGH' })];

  it('erkennt ein Finding ohne Urteil', () => {
    const result = checkVerdictCompleteness(findings, [verdict({ finding_id: 'ARCH-001' })]);
    expect(result.complete).toBe(false);
    if (!result.complete) expect(result.missing).toEqual(['SEC-001']);
  });

  it('ist vollstaendig, wenn jedes Finding genau ein Urteil hat', () => {
    const result = checkVerdictCompleteness(findings, [
      verdict({ finding_id: 'ARCH-001' }),
      rejection({ finding_id: 'SEC-001' }),
    ]);
    expect(result.complete).toBe(true);
  });

  it('erkennt ein Urteil zu einem nie erhobenen Finding', () => {
    const result = checkVerdictCompleteness(findings, [
      verdict({ finding_id: 'ARCH-001' }),
      rejection({ finding_id: 'SEC-001' }),
      verdict({ finding_id: 'XXX-999' }),
    ]);
    expect(result.complete).toBe(false);
    if (!result.complete) expect(result.unknown).toEqual(['XXX-999']);
  });

  it('erkennt ein doppelt beurteiltes Finding', () => {
    const result = checkVerdictCompleteness(findings, [
      verdict({ finding_id: 'ARCH-001' }),
      rejection({ finding_id: 'ARCH-001' }),
      rejection({ finding_id: 'SEC-001' }),
    ]);
    expect(result.complete).toBe(false);
    if (!result.complete) expect(result.duplicated).toEqual(['ARCH-001']);
  });
});

describe('rejectedFindingsNeedingHuman — HIGH/CRITICAL', () => {
  it('eskaliert ein abgelehntes CRITICAL-Finding', () => {
    const findings = [finding({ finding_id: 'SEC-001', severity: 'CRITICAL' })];
    const escalating = rejectedFindingsNeedingHuman(findings, [rejection({ finding_id: 'SEC-001' })]);
    expect(escalating.map((entry) => entry.finding_id)).toEqual(['SEC-001']);
  });

  it('eskaliert ein abgelehntes HIGH-Finding', () => {
    const findings = [finding({ finding_id: 'ARCH-002', severity: 'HIGH' })];
    expect(rejectedFindingsNeedingHuman(findings, [rejection({ finding_id: 'ARCH-002' })])).toHaveLength(1);
  });

  it('eskaliert nicht, wenn ein CRITICAL-Finding angenommen wurde', () => {
    const findings = [finding({ finding_id: 'SEC-001', severity: 'CRITICAL' })];
    expect(rejectedFindingsNeedingHuman(findings, [verdict({ finding_id: 'SEC-001' })])).toHaveLength(0);
  });

  it('eskaliert nicht bei abgelehnten MEDIUM- und LOW-Findings', () => {
    const findings = [
      finding({ finding_id: 'MED-001', severity: 'MEDIUM' }),
      finding({ finding_id: 'LOW-001', severity: 'LOW' }),
    ];
    const verdicts = [rejection({ finding_id: 'MED-001' }), rejection({ finding_id: 'LOW-001' })];
    expect(rejectedFindingsNeedingHuman(findings, verdicts)).toHaveLength(0);
  });
});
