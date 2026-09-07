/**
 * Der Audit Trail als lesbarer Text.
 *
 * Adressat ist der Mensch, der nach drei Runden entscheiden muss. Er sieht
 * deshalb beides: was umgesetzt wurde und was mit welcher Begruendung abgelehnt
 * wurde — und ob ueberhaupt ein echtes Modell geantwortet hat oder ein Mock.
 */

import { sortFindings } from './findings.js';
import type { LoopAction } from './loop.js';
import type { AuditTrail, RoundRecord } from './rounds.js';
import { latestAttempt } from './rounds.js';

function renderTestRun(run: { command: string; total: number; passed: number; failed: number; skipped: number }): string {
  return `\`${run.command}\` — ${run.passed}/${run.total} bestanden, ${run.failed} fehlgeschlagen, ${run.skipped} uebersprungen`;
}

function renderReview(round: RoundRecord): string[] {
  const lines: string[] = [`### review-${round.round}`, ''];
  if (round.review_attempts.length === 0) {
    lines.push('_Noch kein Reviewversuch._', '');
    return lines;
  }

  round.review_attempts.forEach((attempt, index) => {
    const label = round.review_attempts.length > 1 ? ` (Versuch ${index + 1})` : '';
    const provider =
      attempt.provider_status === 'mock'
        ? `\`${attempt.provider_id}\` **[MOCK — kein echtes Modell]**`
        : `\`${attempt.provider_id}\``;
    lines.push(`Reviewer${label}: ${provider}, Antwort ${attempt.received_at}`, '');

    if (attempt.status === 'unusable') {
      lines.push(`**Antwort unbrauchbar:** ${attempt.error}`, '');
      if (attempt.raw_excerpt !== '') {
        lines.push('```text', attempt.raw_excerpt, '```', '');
      }
      return;
    }

    if (attempt.findings.length === 0) {
      lines.push('Keine Findings.', '');
      return;
    }

    lines.push('| ID | Schweregrad | Kategorie | Datei | Zeilen | Confidence |', '| --- | --- | --- | --- | --- | --- |');
    for (const finding of sortFindings(attempt.findings)) {
      lines.push(
        `| ${finding.finding_id} | ${finding.severity} | ${finding.category} | \`${finding.file}\` | ${finding.lines} | ${finding.confidence.toFixed(2)} |`,
      );
    }
    lines.push('');
    for (const finding of sortFindings(attempt.findings)) {
      lines.push(
        `**${finding.finding_id} — ${finding.problem}**`,
        '',
        `- Beleg: ${finding.evidence}`,
        `- Geforderte Aenderung: ${finding.required_change}`,
        `- Akzeptanzkriterien: ${finding.acceptance_criteria.map((criterion) => `_${criterion}_`).join('; ')}`,
        '',
      );
    }
  });

  return lines;
}

function renderFix(round: RoundRecord): string[] {
  const lines: string[] = [`### fix-${round.round}`, ''];
  if (round.fix === null) {
    lines.push('_Noch keine Fix-Runde._', '');
    return lines;
  }

  const accepted = round.fix.verdicts.filter((verdict) => verdict.decision === 'ACCEPTED');
  const rejected = round.fix.verdicts.filter((verdict) => verdict.decision === 'REJECTED');

  lines.push(`Abgeschlossen: ${round.fix.completed_at}`, '');

  lines.push(`**Angenommen (${accepted.length})**`, '');
  if (accepted.length === 0) {
    lines.push('_keine_', '');
  } else {
    for (const verdict of accepted) {
      lines.push(
        `- \`${verdict.finding_id}\`: ${verdict.rationale}`,
        `  - Dateien: ${verdict.changed_files.map((file) => `\`${file}\``).join(', ')}`,
        `  - Tests: ${verdict.tests.length === 0 ? '_keine_' : verdict.tests.map((test) => `\`${test}\``).join(', ')}`,
      );
    }
    lines.push('');
  }

  // Abgelehnte Findings stehen genauso ausfuehrlich da wie angenommene. Ein
  // Review, dessen Ablehnungen unsichtbar sind, ist kein Review.
  lines.push(`**Abgelehnt (${rejected.length})**`, '');
  if (rejected.length === 0) {
    lines.push('_keine_', '');
  } else {
    for (const verdict of rejected) {
      lines.push(`- \`${verdict.finding_id}\`: ${verdict.rationale}`);
    }
    lines.push('');
  }

  lines.push(`**Testlauf:** ${renderTestRun(round.fix.test_run)}`, '');

  lines.push('**Verbleibende Risiken**', '');
  if (round.fix.remaining_risks.length === 0) {
    lines.push('_keine benannt_', '');
  } else {
    for (const risk of round.fix.remaining_risks) {
      lines.push(`- ${risk}`);
    }
    lines.push('');
  }

  return lines;
}

function renderAction(action: LoopAction): string[] {
  switch (action.type) {
    case 'REQUEST_REVIEW':
      return [`Naechster Schritt: Review anfordern (Runde ${action.round}, Versuch ${action.attempt}).`];
    case 'APPLY_FIXES':
      return [
        `Naechster Schritt: Findings der Runde ${action.round} beurteilen und umsetzen.`,
        `Umsetzbar: ${action.actionable.length}, menschliche Triage noetig (Confidence zu niedrig): ${action.needs_human_triage.length}.`,
      ];
    case 'FIX_FAILING_TESTS':
      return [`Naechster Schritt: fehlgeschlagene Tests in Runde ${action.round} reparieren — nicht abschalten.`];
    case 'WAIT_FOR_CI':
      return [`Naechster Schritt: CI-Ergebnis abwarten (Runde ${action.round}).`];
    case 'HUMAN_REVIEW_REQUIRED':
      return ['**HUMAN_REVIEW_REQUIRED**', '', `Grund: \`${action.reason}\` — ${action.detail}`];
    case 'READY_FOR_HUMAN_MERGE':
      return [
        'Review ohne Findings, CI gruen. Der PR ist bereit zur menschlichen Pruefung.',
        'Zusammenfuehren nach `main` entscheidet und macht ein Mensch.',
      ];
  }
}

export function renderAuditTrail(trail: AuditTrail, action: LoopAction): string {
  const lines: string[] = [
    `# Review-Audit — ${trail.pull_request.repository}#${trail.pull_request.number}`,
    '',
    `Contract-Version: \`${trail.contract_version}\``,
    '',
    ...renderAction(action),
    '',
  ];

  const mocked = trail.rounds.some((round) =>
    round.review_attempts.some((attempt) => attempt.provider_status === 'mock'),
  );
  if (mocked) {
    lines.push(
      '> **Hinweis:** Mindestens ein Review stammt von einem Mock-Reviewer, nicht von einem',
      '> angebundenen Modell. Die Findings unten sind keine echten Modellbefunde.',
      '',
    );
  }

  for (const round of trail.rounds) {
    lines.push(`## Runde ${round.round}`, '', ...renderReview(round), ...renderFix(round));
  }

  const lastRound = trail.rounds.at(-1);
  if (lastRound !== undefined && latestAttempt(lastRound) === null) {
    lines.push('_Die letzte Runde ist noch offen._', '');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
