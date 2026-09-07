/**
 * Provider-neutrale Reviewer-Schnittstelle.
 *
 * Ein Reviewer bekommt eine Anfrage und liefert Text zurueck. Mehr steht nicht
 * im Vertrag: kein Anbieter, kein Modellname, kein SDK. Ob dahinter GPT, Claude
 * oder ein Skript steht, aendert am Loop nichts — und keiner von ihnen braucht
 * Schreibrechte auf das Repository.
 *
 * `status` ist der Ehrlichkeitsmechanismus: ein Provider sagt selbst, ob er
 * tatsaechlich angebunden ist. `mock` steht im Audit Trail und in jedem Report,
 * damit ein simuliertes Review nie wie ein echtes aussieht.
 */

import type { ReviewRequest } from './request.js';
import type { ProviderStatus } from './rounds.js';

export interface RawReviewResponse {
  provider_id: string;
  provider_status: ProviderStatus;
  /** Die unveraenderte Antwort. Die Auswertung macht `parseReviewResponse`. */
  payload: string;
}

export interface ReviewProvider {
  readonly id: string;
  /** `connected` nur, wenn der Provider wirklich ein Modell erreicht. */
  readonly status: ProviderStatus;
  review(request: ReviewRequest): Promise<RawReviewResponse>;
}

/**
 * Ein Provider, der bewusst nicht funktioniert, weil seine Zugangsdaten fehlen.
 *
 * Das ist der Platzhalter fuer noch nicht angebundene Anbieter. Er
 * improvisiert nicht und liefert keine erfundene Antwort — er sagt, was fehlt.
 */
export class ProviderNotConnectedError extends Error {
  constructor(
    readonly providerId: string,
    readonly missing: readonly string[],
  ) {
    super(
      `Reviewer "${providerId}" ist nicht angebunden. Fehlt: ${missing.join(', ')}. ` +
        'Es wird nichts simuliert und kein Zugang erzeugt — die Anbindung erfolgt bewusst und dokumentiert.',
    );
    this.name = 'ProviderNotConnectedError';
  }
}

export function createNotConnectedProvider(id: string, missing: readonly string[]): ReviewProvider {
  return {
    id,
    // Ein nicht angebundener Provider ist kein `connected`. Er ist auch kein
    // brauchbarer Mock — er wirft.
    status: 'mock',
    review(): Promise<RawReviewResponse> {
      return Promise.reject(new ProviderNotConnectedError(id, missing));
    },
  };
}

export class UnknownProviderError extends Error {
  constructor(id: string, known: readonly string[]) {
    super(`Unbekannter Reviewer "${id}". Bekannt: ${known.join(', ') || '(keiner)'}`);
    this.name = 'UnknownProviderError';
  }
}

export type ProviderRegistry = ReadonlyMap<string, ReviewProvider>;

export function createRegistry(providers: readonly ReviewProvider[]): ProviderRegistry {
  const registry = new Map<string, ReviewProvider>();
  for (const provider of providers) {
    if (registry.has(provider.id)) {
      throw new Error(`Provider-ID "${provider.id}" ist doppelt vergeben`);
    }
    registry.set(provider.id, provider);
  }
  return registry;
}

export function resolveProvider(registry: ProviderRegistry, id: string): ReviewProvider {
  const provider = registry.get(id);
  if (provider === undefined) {
    throw new UnknownProviderError(id, [...registry.keys()]);
  }
  return provider;
}
