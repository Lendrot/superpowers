/**
 * Review Contract, Eingabeseite — was ein externer Reviewer bekommt.
 *
 * Bewusst vollstaendig und bewusst begrenzt: genug Kontext, um einen Befund zu
 * belegen (Diff, Tests, Architekturdokumentation, CI-Ergebnis), und nichts,
 * was der Reviewer nicht braucht. Keine Secrets, keine Zugangsdaten, keine
 * Schreibrechte — ein Reviewer liest und antwortet, mehr nicht.
 */

import { z } from 'zod';

import { REVIEW_CONTRACT_VERSION } from './contract.js';

export const CI_STATUSES = ['passing', 'failing', 'unknown'] as const;
export type CiStatus = (typeof CI_STATUSES)[number];

export const testRunSchema = z
  .object({
    command: z.string().min(1),
    exit_code: z.number().int(),
    total: z.number().int().min(0),
    passed: z.number().int().min(0),
    failed: z.number().int().min(0),
    /**
     * Uebersprungene Tests. Steigt diese Zahl waehrend einer Fix-Runde, wurde
     * ein Test stillgelegt statt repariert — der Loop bricht dann ab.
     */
    skipped: z.number().int().min(0),
  })
  .strict()
  .refine(
    (run) => run.passed + run.failed + run.skipped === run.total,
    'Testzahlen muessen aufgehen: passed + failed + skipped = total',
  );

export type TestRun = z.infer<typeof testRunSchema>;

export const ciSummarySchema = z
  .object({
    status: z.enum(CI_STATUSES),
    /** Ergebnisse der einzelnen Checks, z. B. typecheck/lint/test. */
    checks: z.array(
      z.object({ name: z.string().min(1), conclusion: z.enum(['success', 'failure', 'skipped', 'unknown']) }).strict(),
    ),
    test_run: testRunSchema.nullable(),
  })
  .strict();

export type CiSummary = z.infer<typeof ciSummarySchema>;

export const reviewRequestSchema = z
  .object({
    contract_version: z.literal(REVIEW_CONTRACT_VERSION),
    round: z.number().int().min(1),
    pull_request: z
      .object({
        repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'Form: owner/repo'),
        number: z.number().int().min(1),
        title: z.string().min(1),
        base_branch: z.string().min(1),
        head_branch: z.string().min(1),
        head_sha: z.string().regex(/^[0-9a-f]{7,40}$/, 'Commit-SHA'),
      })
      .strict(),
    /** Der vollstaendige Diff des PR gegen seinen Base-Branch. */
    diff: z.string(),
    changed_files: z.array(z.string().min(1)),
    /** Testdateien, die zum geaenderten Code gehoeren. */
    test_files: z.array(z.string().min(1)),
    /** Architektur- und Statusdokumente als Pfad plus Inhalt. */
    documents: z.array(z.object({ path: z.string().min(1), content: z.string() }).strict()),
    ci: ciSummarySchema,
    /**
     * Findings der Vorrunden mit ihrem Urteil — damit der Reviewer nicht
     * dasselbe erneut meldet und sieht, was mit Begruendung abgelehnt wurde.
     */
    previous_rounds: z.array(
      z
        .object({
          round: z.number().int().min(1),
          finding_ids: z.array(z.string()),
          rejected_finding_ids: z.array(z.string()),
        })
        .strict(),
    ),
  })
  .strict();

export type ReviewRequest = z.infer<typeof reviewRequestSchema>;

/**
 * Die Anweisung an den Reviewer. Provider-neutral: jeder Adapter reicht diesen
 * Text zusammen mit der Anfrage weiter, damit alle Modelle nach denselben
 * Regeln antworten.
 */
export const REVIEWER_INSTRUCTIONS = `Du bist Code-Reviewer fuer einen Pull Request.

Du erhaeltst: den Diff, die zugehoerigen Testdateien, Architektur- und
Statusdokumentation sowie das CI-Ergebnis.

Du lieferst ausschliesslich JSON in genau dieser Form:

{
  "contract_version": "${REVIEW_CONTRACT_VERSION}",
  "findings": [
    {
      "finding_id": "ARCH-001",
      "severity": "CRITICAL | HIGH | MEDIUM | LOW",
      "category": "architecture | correctness | data-model | validation | security | testing | maintainability | documentation",
      "file": "repository-relativer Pfad",
      "lines": "20-35",
      "problem": "Was falsch ist.",
      "evidence": "Woran man es im gelieferten Material sieht.",
      "required_change": "Was konkret geaendert werden muss.",
      "acceptance_criteria": ["Woran der Fix gemessen wird."],
      "confidence": 0.95
    }
  ]
}

Regeln:
- Keine Codeaenderungen, keine Patches, kein Fliesstext ausserhalb des JSON.
- Keine unbelegten Behauptungen: jedes Finding nennt Datei, Zeilen und Beleg.
- Nur Dateien aus dem gelieferten Diff bzw. Repository referenzieren.
- Jede finding_id genau einmal vergeben.
- Findet sich nichts, ist "findings" ein leeres Array. Ein leeres Review ist ein
  gueltiges Ergebnis und besser als ein erfundenes Finding.
- Findings aus Vorrunden, die begruendet abgelehnt wurden, nicht unveraendert
  wiederholen.`;
