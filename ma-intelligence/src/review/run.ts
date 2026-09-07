/**
 * Ein Reviewversuch, von der Anfrage bis zum Audit-Eintrag.
 *
 * Der Unterschied zwischen zwei Fehlerarten ist hier festgelegt und wichtig:
 *
 * - Der Provider ist nicht angebunden → das ist ein Konfigurationsfehler. Er
 *   fliegt hoch und stoppt den Vorgang. Nichts wird stattdessen simuliert.
 * - Der Provider antwortet, aber unbrauchbar → das ist ein Review-Ergebnis. Es
 *   wird protokolliert, und die Zustandsmaschine entscheidet, wie es weitergeht.
 */

import { parseReviewResponse } from './findings.js';
import { ProviderNotConnectedError } from './provider.js';
import type { ReviewProvider } from './provider.js';
import type { ReviewRequest } from './request.js';
import type { ReviewAttempt } from './rounds.js';

export async function requestReview(
  provider: ReviewProvider,
  request: ReviewRequest,
  now: string,
): Promise<ReviewAttempt> {
  let payload: string;
  try {
    const response = await provider.review(request);
    payload = response.payload;
  } catch (error) {
    if (error instanceof ProviderNotConnectedError) throw error;
    return {
      status: 'unusable',
      provider_id: provider.id,
      provider_status: provider.status,
      received_at: now,
      error: `Reviewer nicht erreichbar: ${error instanceof Error ? error.message : String(error)}`,
      raw_excerpt: '',
    };
  }

  const parsed = parseReviewResponse(payload);
  if (parsed.status === 'unusable') {
    return {
      status: 'unusable',
      provider_id: provider.id,
      provider_status: provider.status,
      received_at: now,
      error: parsed.error,
      raw_excerpt: parsed.raw_excerpt,
    };
  }

  return {
    status: 'ok',
    provider_id: provider.id,
    provider_status: provider.status,
    received_at: now,
    findings: parsed.response.findings,
  };
}
