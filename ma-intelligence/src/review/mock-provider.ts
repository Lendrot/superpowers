/**
 * Mock-Reviewer.
 *
 * Er ersetzt kein Modell und behauptet das auch nicht: sein `status` ist
 * `mock`, und dieser Wert wandert durch Audit Trail und Report. Sein Zweck ist,
 * den Loop vollstaendig durchspielbar zu machen — auch die unangenehmen Faelle:
 * kaputtes JSON, leeres Review, CRITICAL-Finding.
 */

import type { ReviewProvider, RawReviewResponse } from './provider.js';
import type { ReviewRequest } from './request.js';

export interface MockProviderOptions {
  id?: string;
  /**
   * Antworten in der Reihenfolge der Aufrufe. Ist die Liste erschoepft, wird
   * die letzte Antwort wiederholt — sonst braeuchte jeder Test eine Antwort
   * mehr, als er Runden hat.
   */
  responses: readonly string[];
}

export interface MockReviewProvider extends ReviewProvider {
  /** Die Anfragen, die der Mock erhalten hat — fuer Zusicherungen in Tests. */
  readonly requests: readonly ReviewRequest[];
}

export function createMockProvider(options: MockProviderOptions): MockReviewProvider {
  if (options.responses.length === 0) {
    throw new Error('createMockProvider: mindestens eine Antwort noetig');
  }
  const id = options.id ?? 'mock';
  const requests: ReviewRequest[] = [];
  let call = 0;

  return {
    id,
    status: 'mock',
    requests,
    review(request: ReviewRequest): Promise<RawReviewResponse> {
      requests.push(request);
      const index = Math.min(call, options.responses.length - 1);
      call += 1;
      const payload = options.responses[index] ?? '';
      return Promise.resolve({ provider_id: id, provider_status: 'mock', payload });
    },
  };
}

/** Eine wohlgeformte, leere Antwort — "nichts gefunden" als gueltiges Ergebnis. */
export function emptyReviewPayload(contractVersion: string): string {
  return JSON.stringify({ contract_version: contractVersion, findings: [] });
}
