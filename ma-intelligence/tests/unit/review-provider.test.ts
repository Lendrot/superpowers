import { describe, expect, it } from 'vitest';

import { REVIEW_CONTRACT_VERSION } from '@/review/contract.js';
import { createMockProvider, emptyReviewPayload } from '@/review/mock-provider.js';
import {
  createNotConnectedProvider,
  createRegistry,
  ProviderNotConnectedError,
  resolveProvider,
  UnknownProviderError,
} from '@/review/provider.js';
import type { ReviewProvider } from '@/review/provider.js';
import { reviewRequestSchema } from '@/review/request.js';
import { requestReview } from '@/review/run.js';
import { finding, NOW, payload, reviewRequest } from '../fixtures/review.js';

describe('reviewRequestSchema — was der Reviewer bekommt', () => {
  it('nimmt eine vollstaendige Anfrage an', () => {
    expect(reviewRequestSchema.parse(reviewRequest())).toEqual(reviewRequest());
  });

  it('verlangt eine passende Contract-Version', () => {
    expect(reviewRequestSchema.safeParse({ ...reviewRequest(), contract_version: '0.1.0' }).success).toBe(false);
  });

  it('weist Zusatzfelder ab — auch scheinbar harmlose', () => {
    expect(reviewRequestSchema.safeParse({ ...reviewRequest(), api_key: 'geheim' }).success).toBe(false);
  });
});

describe('Mock-Provider', () => {
  it('gibt sich als Mock zu erkennen', async () => {
    const provider = createMockProvider({ responses: [emptyReviewPayload(REVIEW_CONTRACT_VERSION)] });
    expect(provider.status).toBe('mock');
    const response = await provider.review(reviewRequest());
    expect(response.provider_status).toBe('mock');
  });

  it('liefert die Antworten in der Reihenfolge der Aufrufe', async () => {
    const provider = createMockProvider({
      responses: [payload([finding()]), emptyReviewPayload(REVIEW_CONTRACT_VERSION)],
    });
    const first = await requestReview(provider, reviewRequest(), NOW);
    const second = await requestReview(provider, reviewRequest({ round: 2 }), NOW);
    expect(first.status === 'ok' && first.findings).toHaveLength(1);
    expect(second.status === 'ok' && second.findings).toHaveLength(0);
    expect(provider.requests.map((request) => request.round)).toEqual([1, 2]);
  });
});

describe('Nicht angebundener Provider', () => {
  it('improvisiert nicht, sondern sagt, was fehlt', async () => {
    const provider = createNotConnectedProvider('gpt', ['OPENAI_API_KEY']);
    await expect(provider.review(reviewRequest())).rejects.toBeInstanceOf(ProviderNotConnectedError);
    await expect(provider.review(reviewRequest())).rejects.toThrow(/OPENAI_API_KEY/);
  });

  it('gilt nie als angebunden', () => {
    expect(createNotConnectedProvider('gpt', ['OPENAI_API_KEY']).status).toBe('mock');
  });

  it('bricht den Vorgang ab, statt ein Review zu erfinden', async () => {
    const provider = createNotConnectedProvider('gpt', ['OPENAI_API_KEY']);
    await expect(requestReview(provider, reviewRequest(), NOW)).rejects.toBeInstanceOf(ProviderNotConnectedError);
  });
});

describe('Registry', () => {
  it('loest Provider ueber ihre ID auf', () => {
    const mock = createMockProvider({ responses: [emptyReviewPayload(REVIEW_CONTRACT_VERSION)] });
    const registry = createRegistry([mock, createNotConnectedProvider('gpt', ['OPENAI_API_KEY'])]);
    expect(resolveProvider(registry, 'mock').id).toBe('mock');
    expect(() => resolveProvider(registry, 'claude')).toThrow(UnknownProviderError);
  });

  it('laesst keine doppelte Provider-ID zu', () => {
    const first = createMockProvider({ id: 'x', responses: ['{}'] });
    const second = createMockProvider({ id: 'x', responses: ['{}'] });
    expect(() => createRegistry([first, second])).toThrow(/doppelt/);
  });
});

describe('requestReview — Fehler des Providers', () => {
  it('macht aus einem Netzwerkfehler ein dokumentiertes Review-Ergebnis', async () => {
    const flaky: ReviewProvider = {
      id: 'flaky',
      status: 'mock',
      review: () => Promise.reject(new Error('ECONNRESET')),
    };
    const attempt = await requestReview(flaky, reviewRequest(), NOW);
    expect(attempt.status).toBe('unusable');
    if (attempt.status === 'unusable') expect(attempt.error).toMatch(/ECONNRESET/);
  });

  it('protokolliert eine beschaedigte Antwort mit Auszug', async () => {
    const provider = createMockProvider({ responses: ['{"findings": ['] });
    const attempt = await requestReview(provider, reviewRequest(), NOW);
    expect(attempt.status).toBe('unusable');
    if (attempt.status === 'unusable') {
      expect(attempt.raw_excerpt).toBe('{"findings": [');
      expect(attempt.provider_status).toBe('mock');
    }
  });
});
