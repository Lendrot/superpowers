import { describe, expect, it } from 'vitest';

import { normalizeCompanyName, normalizeDomain, slugify } from '@/domain/naming.js';

describe('slugify', () => {
  it('transkribiert deutsche Umlaute statt sie zu entfernen', () => {
    expect(slugify('Müller Röhren GmbH')).toBe('mueller_roehren_gmbh');
    expect(slugify('Weiß & Söhne')).toBe('weiss_und_soehne');
  });

  it('erzeugt aus derselben Schreibweise denselben Slug', () => {
    expect(slugify('BASF SE')).toBe(slugify('  basf   se  '));
  });

  it('lehnt Namen ohne verwertbares Zeichen ab', () => {
    expect(() => slugify('  ---  ')).toThrow(RangeError);
  });
});

describe('normalizeCompanyName — das BASF-Problem', () => {
  it('fuehrt Schreibvarianten desselben Unternehmens zusammen', () => {
    const normalized = ['BASF SE', 'BASF', 'BASF Group', 'BASF Gruppe'].map(normalizeCompanyName);
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe('basf');
  });

  it('haelt verschiedene Unternehmen auseinander', () => {
    expect(normalizeCompanyName('Siemens AG')).not.toBe(normalizeCompanyName('Siemens Energy AG'));
  });

  it('behaelt die Rechtsform, wenn sonst nichts uebrig bliebe', () => {
    // Sonst waere die Vergleichsform leer und wuerde mit jeder anderen leeren
    // Form zusammenfallen — aus zwei Holdings wuerde eine.
    expect(normalizeCompanyName('Holding GmbH')).toBe('holding_gmbh');
  });

  it('ist stabil gegenueber Gross- und Kleinschreibung und Zusaetzen', () => {
    expect(normalizeCompanyName('thyssenkrupp AG')).toBe(normalizeCompanyName('ThyssenKrupp'));
  });
});

describe('normalizeDomain', () => {
  it('reduziert auf den Hostnamen ohne www', () => {
    expect(normalizeDomain('https://www.basf.com/de/de.html')).toBe('basf.com');
    expect(normalizeDomain('basf.com')).toBe('basf.com');
    expect(normalizeDomain('HTTP://BASF.COM/')).toBe('basf.com');
  });

  it('gibt null zurueck, wenn nichts Verwertbares uebrig bleibt', () => {
    expect(normalizeDomain('')).toBeNull();
    expect(normalizeDomain('   ')).toBeNull();
  });
});
