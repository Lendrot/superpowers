/**
 * Fix Contract — was Claude als Fix-Agent zu jedem Finding liefern muss.
 *
 * Die tragende Regel: **jedes Finding braucht ein Urteil**. Ein abgelehntes
 * Finding wird begruendet abgelehnt und bleibt im Audit Trail stehen. Ein
 * Finding, das einfach nicht mehr auftaucht, ist der Weg, auf dem ein Review
 * wirkungslos wird.
 */

import { z } from 'zod';

import { SEVERITIES_REQUIRING_HUMAN_ON_REJECT, VERDICT_DECISIONS } from './contract.js';
import { findingIdSchema } from './findings.js';
import type { Finding } from './findings.js';

export const verdictSchema = z
  .object({
    finding_id: findingIdSchema,
    decision: z.enum(VERDICT_DECISIONS),
    /**
     * Warum. Bei ACCEPTED: was geaendert wurde. Bei REJECTED: woran die
     * Behauptung des Reviewers scheitert — gemessen an Code, Tests oder
     * Architekturdokumentation, nicht an Bequemlichkeit.
     */
    rationale: z.string().trim().min(20, 'Die Begruendung muss die Entscheidung tragen'),
    /** Geaenderte Dateien. Bei REJECTED leer. */
    changed_files: z.array(z.string().min(1)),
    /** Tests, die den Fix absichern. Bei REJECTED leer. */
    tests: z.array(z.string().min(1)),
  })
  .strict()
  .refine(
    (verdict) => verdict.decision === 'ACCEPTED' || verdict.changed_files.length === 0,
    'Ein abgelehntes Finding darf keine Codeaenderung mit sich bringen',
  )
  .refine(
    (verdict) => verdict.decision === 'REJECTED' || verdict.changed_files.length > 0,
    'Ein angenommenes Finding ohne geaenderte Datei ist nicht umgesetzt',
  );

export type Verdict = z.infer<typeof verdictSchema>;

export type VerdictCompleteness =
  | { complete: true }
  | { complete: false; missing: string[]; unknown: string[]; duplicated: string[] };

/**
 * Prueft, ob zu jedem Finding genau ein Urteil vorliegt — und ob kein Urteil zu
 * einem Finding existiert, das der Reviewer nie erhoben hat.
 */
export function checkVerdictCompleteness(
  findings: readonly Finding[],
  verdicts: readonly Verdict[],
): VerdictCompleteness {
  const findingIds = new Set(findings.map((finding) => finding.finding_id));
  const seen = new Set<string>();
  const duplicated: string[] = [];
  const unknown: string[] = [];

  for (const verdict of verdicts) {
    if (seen.has(verdict.finding_id)) {
      duplicated.push(verdict.finding_id);
    }
    seen.add(verdict.finding_id);
    if (!findingIds.has(verdict.finding_id)) {
      unknown.push(verdict.finding_id);
    }
  }

  const missing = [...findingIds].filter((id) => !seen.has(id)).sort();

  if (missing.length === 0 && unknown.length === 0 && duplicated.length === 0) {
    return { complete: true };
  }
  return { complete: false, missing, unknown: unknown.sort(), duplicated: duplicated.sort() };
}

/**
 * Abgelehnte Findings, deren Schweregrad eine menschliche Bestaetigung
 * verlangt. Ein Agent darf sein eigenes CRITICAL-Finding nicht allein abraeumen.
 */
export function rejectedFindingsNeedingHuman(
  findings: readonly Finding[],
  verdicts: readonly Verdict[],
): Finding[] {
  const rejected = new Set(
    verdicts.filter((verdict) => verdict.decision === 'REJECTED').map((verdict) => verdict.finding_id),
  );
  const escalating = new Set<string>(SEVERITIES_REQUIRING_HUMAN_ON_REJECT);
  return findings.filter((finding) => rejected.has(finding.finding_id) && escalating.has(finding.severity));
}
