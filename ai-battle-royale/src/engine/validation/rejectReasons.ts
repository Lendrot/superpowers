/**
 * Doc 08 §8.1 — Ablehnungsgruende.
 *
 * Sie werden gezaehlt, nicht nur geworfen: eine Reject-Rate ueber 2 % ist laut
 * Spec ein Bug im Kandidatengenerator. Ohne Zaehler pro Grund ist nicht
 * feststellbar, welcher.
 */

import type { RejectReason } from '../core/types.js';

export const REJECT_REASONS = [
  'schema_invalid',
  'actor_invalid',
  'target_invalid',
  'precondition_failed',
  'insufficient_resources',
  'effect_invalid',
  // Stufe 7 — der Truth-Validator. Diese fuenf zaehlen mit: `falseAssertionsRejected`
  // soll im Normalbetrieb 0 sein (Doc 08 §8.2.4), jeder Ausschlag zeigt einen
  // Bug im Kandidatengenerator, nicht einen luegenden Agenten.
  'unknown_reference',
  'false_assertion',
  'unsupported_certainty',
  'unattributed_hearsay',
  'self_contradiction',
] as const satisfies readonly RejectReason[];

export type RejectCounts = Record<RejectReason, number>;

export function emptyRejectCounts(): RejectCounts {
  const counts = {} as RejectCounts;
  for (const reason of REJECT_REASONS) counts[reason] = 0;
  return counts;
}

export function totalRejects(counts: Readonly<RejectCounts>): number {
  return REJECT_REASONS.reduce((sum, reason) => sum + counts[reason], 0);
}
