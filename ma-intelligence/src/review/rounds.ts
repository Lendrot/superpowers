/**
 * Audit Trail — der Datensatz einer Runde.
 *
 * Jede Runde besteht aus Reviewversuchen und hoechstens einem Fix. Beides wird
 * vollstaendig festgehalten: angenommene *und* abgelehnte Findings, geaenderte
 * Dateien, Testergebnis, verbleibende Risiken. Der Trail ist der Grund, warum
 * ein Mensch nach drei Runden noch nachvollziehen kann, was passiert ist.
 */

import { z } from 'zod';

import { findingSchema } from './findings.js';
import { testRunSchema } from './request.js';
import { verdictSchema } from './verdicts.js';

export const PROVIDER_STATUSES = ['mock', 'connected'] as const;
export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];

/**
 * Ein Reviewversuch. `unusable` ist ein regulaerer, dokumentierter Ausgang —
 * eine kaputte Modellantwort wird protokolliert, nicht verschluckt.
 */
export const reviewAttemptSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('ok'),
      provider_id: z.string().min(1),
      provider_status: z.enum(PROVIDER_STATUSES),
      received_at: z.string().min(1),
      findings: z.array(findingSchema),
    })
    .strict(),
  z
    .object({
      status: z.literal('unusable'),
      provider_id: z.string().min(1),
      provider_status: z.enum(PROVIDER_STATUSES),
      received_at: z.string().min(1),
      error: z.string().min(1),
      raw_excerpt: z.string(),
    })
    .strict(),
]);

export type ReviewAttempt = z.infer<typeof reviewAttemptSchema>;

export const fixRecordSchema = z
  .object({
    completed_at: z.string().min(1),
    verdicts: z.array(verdictSchema),
    changed_files: z.array(z.string().min(1)),
    test_run: testRunSchema,
    /** Was nach diesem Fix offen bleibt — auch wenn alle Tests gruen sind. */
    remaining_risks: z.array(z.string().min(1)),
  })
  .strict();

export type FixRecord = z.infer<typeof fixRecordSchema>;

export const roundRecordSchema = z
  .object({
    round: z.number().int().min(1),
    review_attempts: z.array(reviewAttemptSchema),
    fix: fixRecordSchema.nullable(),
  })
  .strict();

export type RoundRecord = z.infer<typeof roundRecordSchema>;

export const auditTrailSchema = z
  .object({
    contract_version: z.string().min(1),
    pull_request: z.object({ repository: z.string().min(1), number: z.number().int().min(1) }).strict(),
    rounds: z.array(roundRecordSchema),
  })
  .strict()
  .refine(
    (trail) => trail.rounds.every((round, index) => round.round === index + 1),
    'Runden sind luecken- und sprungfrei ab 1 zu nummerieren',
  );

export type AuditTrail = z.infer<typeof auditTrailSchema>;

/** Der letzte Reviewversuch einer Runde, oder null, wenn noch keiner lief. */
export function latestAttempt(round: RoundRecord): ReviewAttempt | null {
  return round.review_attempts.at(-1) ?? null;
}

/** Die Findings einer Runde, sofern der letzte Versuch brauchbar war. */
export function findingsOf(round: RoundRecord): ReturnType<typeof findingSchema.parse>[] {
  const attempt = latestAttempt(round);
  return attempt !== null && attempt.status === 'ok' ? attempt.findings : [];
}
