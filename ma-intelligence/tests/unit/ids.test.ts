import { describe, expect, it } from 'vitest';

import {
  assetId,
  commodityId,
  companyId,
  dealId,
  eventId,
  idPrefixOf,
  isId,
  ownershipId,
  sourceId,
} from '@/domain/ids.js';

describe('companyId', () => {
  it('ist lesbar und aus dem Namen abgeleitet', () => {
    expect(companyId('BASF SE')).toBe('company_basf_se');
    expect(companyId('Müller Röhren GmbH')).toBe('company_mueller_roehren_gmbh');
  });

  it('trennt echte Namensgleichheit ueber den Diskriminator', () => {
    expect(companyId('Müller GmbH', 'Hamburg')).toBe('company_mueller_gmbh_hamburg');
    expect(companyId('Müller GmbH')).not.toBe(companyId('Müller GmbH', 'Hamburg'));
  });
});

describe('dealId', () => {
  const target = companyId('Musterwerke GmbH');
  const buyer = companyId('Beispiel Chemie AG');

  it('setzt sich aus Ziel, Kaeufer und Jahr zusammen', () => {
    expect(dealId({ targetId: target, buyerId: buyer, year: 2025 })).toBe(
      'deal_musterwerke_gmbh__beispiel_chemie_ag__2025',
    );
  });

  it('benennt einen noch unbekannten Kaeufer ausdruecklich', () => {
    expect(dealId({ targetId: target, buyerId: null, year: 2025 })).toBe(
      'deal_musterwerke_gmbh__unknown_buyer__2025',
    );
  });

  it('ist bei gleichen Bestandteilen identisch', () => {
    const first = dealId({ targetId: target, buyerId: buyer, year: 2025 });
    const second = dealId({ targetId: target, buyerId: buyer, year: 2025 });
    expect(first).toBe(second);
  });

  it('lehnt unplausible Jahre ab', () => {
    expect(() => dealId({ targetId: target, buyerId: buyer, year: 25 })).toThrow(RangeError);
  });
});

describe('ownershipId', () => {
  it('unterscheidet Beteiligungen desselben Paares nach Beginn', () => {
    const owner = companyId('Beispiel Chemie AG');
    const owned = companyId('Musterwerke GmbH');
    const first = ownershipId({ ownerId: owner, ownedId: owned, validFrom: '2019-01-01' });
    const second = ownershipId({ ownerId: owner, ownedId: owned, validFrom: '2025-11-04' });
    expect(first).not.toBe(second);
    expect(ownershipId({ ownerId: owner, ownedId: owned, validFrom: null })).toMatch(/__open$/);
  });
});

describe('sourceId', () => {
  const base = { publisher: 'Beispielblatt', title: 'Titel', publicationDate: '2025-11-04' };

  it('haengt bei vorhandener URL nur an der URL', () => {
    const withPath = sourceId({ ...base, url: 'https://example.org/a' });
    const sameUrlOtherTitle = sourceId({ ...base, title: 'Anderer Titel', url: 'https://example.org/a' });
    const otherUrl = sourceId({ ...base, url: 'https://example.org/b' });
    expect(withPath).toBe(sameUrlOtherTitle);
    expect(withPath).not.toBe(otherUrl);
  });

  it('faellt ohne URL auf Publisher, Titel und Datum zurueck', () => {
    const printed = sourceId({ ...base, url: null });
    expect(printed).not.toBe(sourceId({ ...base, url: null, title: 'Anderer Titel' }));
    expect(printed.startsWith('source_beispielblatt_')).toBe(true);
  });
});

describe('ID-Erkennung', () => {
  it('erkennt gueltige IDs an ihrem Prefix', () => {
    expect(isId('company', companyId('BASF SE'))).toBe(true);
    expect(isId('deal', companyId('BASF SE'))).toBe(false);
    expect(idPrefixOf(assetId('Musterhuette'))).toBe('asset');
    expect(idPrefixOf(commodityId('Kupfer'))).toBe('commodity');
    expect(idPrefixOf(eventId({ date: '2025-11-04', headline: 'Meldung' }))).toBe('event');
  });

  it('weist Fremdformate ab', () => {
    expect(idPrefixOf('Company_BASF')).toBeNull();
    expect(idPrefixOf('company_')).toBeNull();
    expect(idPrefixOf('550e8400-e29b-41d4-a716-446655440000')).toBeNull();
  });
});
