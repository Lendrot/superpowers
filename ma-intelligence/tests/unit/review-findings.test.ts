import { describe, expect, it } from 'vitest';

import { REVIEW_CONTRACT_VERSION } from '@/review/contract.js';
import { findingSchema, parseReviewResponse, partitionFindings, sortFindings } from '@/review/findings.js';
import { finding, payload } from '../fixtures/review.js';

describe('findingSchema — gueltiges Finding', () => {
  it('nimmt ein vollstaendiges Finding an', () => {
    expect(findingSchema.parse(finding())).toEqual(finding());
  });

  it('nimmt alle vier Schweregrade und alle acht Kategorien an', () => {
    for (const severity of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const) {
      expect(findingSchema.safeParse(finding({ severity })).success).toBe(true);
    }
    for (const category of [
      'architecture',
      'correctness',
      'data-model',
      'validation',
      'security',
      'testing',
      'maintainability',
      'documentation',
    ] as const) {
      expect(findingSchema.safeParse(finding({ category })).success).toBe(true);
    }
  });
});

describe('findingSchema — ungueltiges Finding', () => {
  it('weist erfundene Schweregrade und Kategorien ab', () => {
    expect(findingSchema.safeParse(finding({ severity: 'BLOCKER' as never })).success).toBe(false);
    expect(findingSchema.safeParse(finding({ category: 'performance' as never })).success).toBe(false);
  });

  it('verlangt eine ID der Form ARCH-001', () => {
    expect(findingSchema.safeParse(finding({ finding_id: 'arch-1' as never })).success).toBe(false);
    expect(findingSchema.safeParse(finding({ finding_id: 'SEC-042' })).success).toBe(true);
  });

  it('laesst keine Pfade aus dem Repository heraus', () => {
    expect(findingSchema.safeParse(finding({ file: '/etc/passwd' })).success).toBe(false);
    expect(findingSchema.safeParse(finding({ file: '../../.ssh/id_rsa' })).success).toBe(false);
    expect(findingSchema.safeParse(finding({ file: 'src/review/loop.ts' })).success).toBe(true);
  });

  it('prueft die Zeilenangabe', () => {
    expect(findingSchema.safeParse(finding({ lines: '35-20' })).success).toBe(false);
    expect(findingSchema.safeParse(finding({ lines: '0' })).success).toBe(false);
    expect(findingSchema.safeParse(finding({ lines: 'ganze Datei' })).success).toBe(false);
    expect(findingSchema.safeParse(finding({ lines: '20' })).success).toBe(true);
  });

  it('verlangt Beleg, geforderte Aenderung und mindestens ein Akzeptanzkriterium', () => {
    expect(findingSchema.safeParse(finding({ evidence: 'schlecht' })).success).toBe(false);
    expect(findingSchema.safeParse(finding({ required_change: '' })).success).toBe(false);
    expect(findingSchema.safeParse(finding({ acceptance_criteria: [] })).success).toBe(false);
  });

  it('begrenzt Confidence auf 0 bis 1', () => {
    expect(findingSchema.safeParse(finding({ confidence: 95 })).success).toBe(false);
    expect(findingSchema.safeParse(finding({ confidence: -0.1 })).success).toBe(false);
  });

  it('weist Zusatzfelder ab', () => {
    expect(findingSchema.safeParse({ ...finding(), patch: 'diff --git …' }).success).toBe(false);
  });
});

describe('parseReviewResponse — AI liefert keine Findings', () => {
  it('behandelt ein leeres Findings-Array als gueltiges Ergebnis', () => {
    const parsed = parseReviewResponse(payload([]));
    expect(parsed.status).toBe('ok');
    if (parsed.status === 'ok') expect(parsed.response.findings).toEqual([]);
  });
});

describe('parseReviewResponse — beschaedigte Antwort', () => {
  it('meldet abgeschnittenes JSON als unbrauchbar, ohne zu werfen', () => {
    const parsed = parseReviewResponse('{"contract_version": "1.0.0", "findings": [');
    expect(parsed.status).toBe('unusable');
    if (parsed.status === 'unusable') expect(parsed.error).toMatch(/kein JSON/);
  });

  it('meldet eine leere Antwort', () => {
    expect(parseReviewResponse('   ').status).toBe('unusable');
  });

  it('meldet Fliesstext statt JSON', () => {
    const parsed = parseReviewResponse('Mir ist aufgefallen, dass die Datei zu lang ist.');
    expect(parsed.status).toBe('unusable');
  });

  it('meldet ein Finding, das den Contract verletzt, mit Feldangabe', () => {
    const parsed = parseReviewResponse(payload([finding({ severity: 'URGENT' as never })]));
    expect(parsed.status).toBe('unusable');
    if (parsed.status === 'unusable') expect(parsed.error).toMatch(/severity/);
  });

  it('meldet doppelte finding_id — sonst ist ein Finding nicht adressierbar', () => {
    const parsed = parseReviewResponse(payload([finding(), finding()]));
    expect(parsed.status).toBe('unusable');
    if (parsed.status === 'unusable') expect(parsed.error).toMatch(/ARCH-001/);
  });

  it('nimmt einen Markdown-Codezaun hin, aber nichts darueber hinaus', () => {
    const fenced = `\`\`\`json\n${payload([finding()])}\n\`\`\``;
    expect(parseReviewResponse(fenced).status).toBe('ok');
    expect(parseReviewResponse(`Hier mein Review:\n${payload([finding()])}`).status).toBe('unusable');
  });

  it('kuerzt den Auszug der Rohantwort', () => {
    const parsed = parseReviewResponse('x'.repeat(1000));
    expect(parsed.status).toBe('unusable');
    if (parsed.status === 'unusable') expect(parsed.raw_excerpt.length).toBeLessThanOrEqual(401);
  });

  it('weist eine Antwort ohne contract_version ab', () => {
    expect(parseReviewResponse(JSON.stringify({ findings: [] })).status).toBe('unusable');
    expect(parseReviewResponse(JSON.stringify({ contract_version: REVIEW_CONTRACT_VERSION, findings: [] })).status).toBe(
      'ok',
    );
  });
});

describe('Sortierung und Triage', () => {
  it('sortiert CRITICAL zuerst, dann nach ID', () => {
    const sorted = sortFindings([
      finding({ finding_id: 'LOW-001', severity: 'LOW' }),
      finding({ finding_id: 'SEC-002', severity: 'CRITICAL' }),
      finding({ finding_id: 'SEC-001', severity: 'CRITICAL' }),
      finding({ finding_id: 'MED-001', severity: 'MEDIUM' }),
    ]);
    expect(sorted.map((entry) => entry.finding_id)).toEqual(['SEC-001', 'SEC-002', 'MED-001', 'LOW-001']);
  });

  it('haelt Findings mit niedriger Confidence von der automatischen Umsetzung fern', () => {
    const { actionable, needs_human_triage } = partitionFindings([
      finding({ finding_id: 'ARCH-001', confidence: 0.9 }),
      finding({ finding_id: 'ARCH-002', confidence: 0.3 }),
    ]);
    expect(actionable.map((entry) => entry.finding_id)).toEqual(['ARCH-001']);
    // Es verschwindet nicht — es wandert in die menschliche Triage.
    expect(needs_human_triage.map((entry) => entry.finding_id)).toEqual(['ARCH-002']);
  });
});
