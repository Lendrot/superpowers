/**
 * Die Zustandsmaschine des Review-Loops.
 *
 * Eine reine Funktion: aus dem Audit Trail plus CI-Stand folgt genau eine
 * naechste Handlung. Der Agent entscheidet nicht selbst, ob er noch eine Runde
 * dreht — er fragt hier nach und bekommt irgendwann HUMAN_REVIEW_REQUIRED.
 *
 * Was hier niemals herauskommen kann: "merge". Der Loop fuehrt bis an den Rand
 * der Zusammenfuehrung und dann zu einem Menschen.
 */

import { MAX_REVIEW_ATTEMPTS_PER_ROUND, MAX_REVIEW_ROUNDS } from './contract.js';
import { partitionFindings } from './findings.js';
import type { Finding } from './findings.js';
import type { CiStatus, TestRun } from './request.js';
import { findingsOf, latestAttempt } from './rounds.js';
import type { RoundRecord } from './rounds.js';
import { checkVerdictCompleteness, rejectedFindingsNeedingHuman } from './verdicts.js';

export const ESCALATION_REASONS = [
  'max_review_rounds_reached',
  'reviewer_response_unusable',
  'high_severity_finding_rejected',
  'test_weakening',
  'verdicts_incomplete',
] as const;

export type EscalationReason = (typeof ESCALATION_REASONS)[number];

export type LoopAction =
  | { type: 'REQUEST_REVIEW'; round: number; attempt: number }
  | { type: 'APPLY_FIXES'; round: number; actionable: Finding[]; needs_human_triage: Finding[] }
  | { type: 'FIX_FAILING_TESTS'; round: number }
  | { type: 'WAIT_FOR_CI'; round: number }
  | { type: 'HUMAN_REVIEW_REQUIRED'; reason: EscalationReason; detail: string }
  | { type: 'READY_FOR_HUMAN_MERGE' };

export interface LoopInput {
  rounds: readonly RoundRecord[];
  /** Stand der CI auf dem aktuellen Head-Commit. */
  ci: CiStatus;
  /**
   * Testlauf vor der ersten Fix-Runde. Bezugspunkt fuer die Frage, ob eine
   * Fix-Runde Tests stillgelegt hat.
   */
  baseline_test_run: TestRun | null;
}

/**
 * Weniger Tests oder mehr uebersprungene Tests als vorher: ein Test wurde
 * stillgelegt statt repariert.
 *
 * Auch legitime Faelle (zwei Tests zu einem zusammengefasst) landen hier — das
 * ist gewollt. Die Frage "war das in Ordnung?" beantwortet ein Mensch, nicht
 * der Agent, der die Aenderung gerade selbst gemacht hat.
 */
export function detectTestWeakening(previous: TestRun | null, current: TestRun): string | null {
  if (previous === null) return null;
  if (current.skipped > previous.skipped) {
    return `Uebersprungene Tests von ${previous.skipped} auf ${current.skipped} gestiegen`;
  }
  if (current.total < previous.total) {
    return `Anzahl der Tests von ${previous.total} auf ${current.total} gesunken`;
  }
  return null;
}

function previousTestRun(rounds: readonly RoundRecord[], index: number, baseline: TestRun | null): TestRun | null {
  for (let position = index - 1; position >= 0; position -= 1) {
    const earlier = rounds[position];
    if (earlier?.fix != null) return earlier.fix.test_run;
  }
  return baseline;
}

/**
 * Die naechste zulaessige Handlung. Die Reihenfolge der Pruefungen ist die
 * Sicherheitsordnung: erst die Abbruchgruende, dann die Arbeit.
 */
export function decideNextAction(input: LoopInput): LoopAction {
  const { rounds } = input;

  if (rounds.length === 0) {
    return { type: 'REQUEST_REVIEW', round: 1, attempt: 1 };
  }

  const index = rounds.length - 1;
  const current = rounds[index];
  if (current === undefined) {
    return { type: 'REQUEST_REVIEW', round: 1, attempt: 1 };
  }

  const attempt = latestAttempt(current);

  if (attempt === null) {
    return { type: 'REQUEST_REVIEW', round: current.round, attempt: 1 };
  }

  if (attempt.status === 'unusable') {
    if (current.review_attempts.length >= MAX_REVIEW_ATTEMPTS_PER_ROUND) {
      return {
        type: 'HUMAN_REVIEW_REQUIRED',
        reason: 'reviewer_response_unusable',
        detail: `Reviewer lieferte in Runde ${current.round} ${current.review_attempts.length}-mal keine verwertbare Antwort: ${attempt.error}`,
      };
    }
    return { type: 'REQUEST_REVIEW', round: current.round, attempt: current.review_attempts.length + 1 };
  }

  const findings = findingsOf(current);

  // Fix-Runde noch nicht gelaufen.
  if (current.fix === null) {
    if (findings.length === 0) {
      if (input.ci === 'failing') return { type: 'FIX_FAILING_TESTS', round: current.round };
      if (input.ci === 'unknown') return { type: 'WAIT_FOR_CI', round: current.round };
      return { type: 'READY_FOR_HUMAN_MERGE' };
    }
    const { actionable, needs_human_triage } = partitionFindings(findings);
    return { type: 'APPLY_FIXES', round: current.round, actionable, needs_human_triage };
  }

  const fix = current.fix;

  const weakening = detectTestWeakening(previousTestRun(rounds, index, input.baseline_test_run), fix.test_run);
  if (weakening !== null) {
    return {
      type: 'HUMAN_REVIEW_REQUIRED',
      reason: 'test_weakening',
      detail: `Runde ${current.round}: ${weakening}. Tests werden nicht stillgelegt, um einen Build gruen zu bekommen.`,
    };
  }

  const completeness = checkVerdictCompleteness(findings, fix.verdicts);
  if (!completeness.complete) {
    const parts = [
      completeness.missing.length > 0 ? `ohne Urteil: ${completeness.missing.join(', ')}` : null,
      completeness.unknown.length > 0 ? `unbekannte Findings: ${completeness.unknown.join(', ')}` : null,
      completeness.duplicated.length > 0 ? `mehrfach beurteilt: ${completeness.duplicated.join(', ')}` : null,
    ].filter((part): part is string => part !== null);
    return {
      type: 'HUMAN_REVIEW_REQUIRED',
      reason: 'verdicts_incomplete',
      detail: `Runde ${current.round}: ${parts.join('; ')}`,
    };
  }

  const escalating = rejectedFindingsNeedingHuman(findings, fix.verdicts);
  if (escalating.length > 0) {
    return {
      type: 'HUMAN_REVIEW_REQUIRED',
      reason: 'high_severity_finding_rejected',
      detail: `Runde ${current.round}: ${escalating
        .map((finding) => `${finding.finding_id} (${finding.severity})`)
        .join(', ')} wurde abgelehnt — das bestaetigt ein Mensch.`,
    };
  }

  if (current.round >= MAX_REVIEW_ROUNDS) {
    return {
      type: 'HUMAN_REVIEW_REQUIRED',
      reason: 'max_review_rounds_reached',
      detail: `${MAX_REVIEW_ROUNDS} Review/Fix-Runden sind abgeschlossen. Weitere Runden startet der Agent nicht selbst.`,
    };
  }

  if (fix.test_run.failed > 0 || fix.test_run.exit_code !== 0) {
    return { type: 'FIX_FAILING_TESTS', round: current.round };
  }

  return { type: 'REQUEST_REVIEW', round: current.round + 1, attempt: 1 };
}

/** Darf der Agent ueberhaupt noch handeln, oder ist ein Mensch am Zug? */
export function isBlockedOnHuman(action: LoopAction): boolean {
  return action.type === 'HUMAN_REVIEW_REQUIRED';
}
