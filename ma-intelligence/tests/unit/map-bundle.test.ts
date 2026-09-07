import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { intelligenceDatabaseSchema } from '@/domain/entities.js';
import { buildMapBundle } from '@/store/map-bundle.js';
import { checkIntegrity, hasErrors } from '@/store/integrity.js';
import { emptyDatabase } from '@/store/database.js';
import type { IntelligenceDatabase } from '@/domain/types.js';
import { exampleBuyer, exampleDeal, exampleSource, exampleTarget } from '../fixtures/records.js';

function database(): IntelligenceDatabase {
  return {
    ...emptyDatabase(),
    companies: [exampleBuyer, exampleTarget],
    deals: [exampleDeal],
    sources: [exampleSource],
  };
}

describe('buildMapBundle', () => {
  it('legt zu jedem Deal die Anzeigezeile bereit', () => {
    const bundle = buildMapBundle(database());
    expect(bundle.meta.deal_count).toBe(1);
    const entry = bundle.deals[0];
    expect(entry?.target.name).toBe('Musterwerke');
    expect(entry?.buyers).toEqual(['Beispiel Chemie']);
    expect(entry?.status_label).toBe('Angekündigt');
    expect(entry?.sources[0]?.url).toBe('https://example.org/meldung/1');
  });

  it('zaehlt Standorte und undatierte Deals getrennt', () => {
    const ohneStandort = {
      ...exampleTarget,
      latitude: null,
      longitude: null,
      coordinate_accuracy: 'unknown' as const,
    };
    const bundle = buildMapBundle(
      { ...database(), companies: [exampleBuyer, ohneStandort] }
    );
    expect(bundle.meta.deal_count).toBe(1);
    expect(bundle.meta.located_count).toBe(0);
  });

  it('markiert Geruechte als unbestaetigt', () => {
    const bundle = buildMapBundle(
      { ...database(), deals: [{ ...exampleDeal, status: 'rumored' }] }
    );
    expect(bundle.deals[0]?.unconfirmed).toBe(true);
    expect(bundle.deals[0]?.status_label).toBe('Gerücht');
  });

  it('trennt die belegte Kaufabsicht von einem Angebot', () => {
    // v004 fuehrt `interest` als eigenen Zustand: der Kaeufer sagt die Absicht
    // zu, ein Angebot liegt nicht vor. Das ist nicht bestaetigt und muss von
    // einem angekuendigten Deal unterscheidbar bleiben (Regel 2).
    const bundle = buildMapBundle({ ...database(), deals: [{ ...exampleDeal, status: 'intent' }] });
    expect(bundle.deals[0]?.status_label).toBe('Kaufabsicht');
    expect(bundle.deals[0]?.unconfirmed).toBe(true);
  });

  it('bietet nur Filterwerte an, die tatsaechlich vorkommen', () => {
    const bundle = buildMapBundle(database());
    expect(bundle.filters.statuses.map((entry) => entry.key)).toEqual(['announced']);
    expect(bundle.filters.industries.map((entry) => entry.key)).toEqual(['industrial_manufacturing']);
    expect(bundle.filters.date_range).toEqual({ from: '2025-11-04', to: '2025-11-04' });
  });

  it('sortiert neueste zuerst und undatierte ans Ende', () => {
    const aelter = { ...exampleDeal, id: 'deal_a__b__2024' as const, announcement_date: '2024-01-01' };
    const undatiert = {
      ...exampleDeal,
      id: 'deal_c__d__undated' as const,
      announcement_date: null,
      completion_date: null,
    };
    const bundle = buildMapBundle({ ...database(), deals: [aelter, undatiert, exampleDeal] });
    expect(bundle.deals.map((entry) => entry.date)).toEqual(['2025-11-04', '2024-01-01', null]);
  });

  it('filtert auf das Zielland', () => {
    const bundle = buildMapBundle(database(), 'FR');
    expect(bundle.meta.deal_count).toBe(0);
    expect(bundle.filters.date_range).toEqual({ from: null, to: null });
  });
});

describe('Der ausgelieferte Deutschland-Datensatz', () => {
  const root = resolve(__dirname, '../..');
  const raw = JSON.parse(
    readFileSync(resolve(root, 'data/intelligence/verified/deutschland-ma.json'), 'utf8'),
  ) as unknown;

  it('haelt dem Schema stand', () => {
    expect(intelligenceDatabaseSchema.safeParse(raw).success).toBe(true);
  });

  it('ist referentiell in Ordnung', () => {
    const parsed = intelligenceDatabaseSchema.parse(raw);
    const issues = checkIntegrity(parsed);
    expect(hasErrors(issues)).toBe(false);
  });

  it('hat zu jedem Deal mindestens eine Quelle', () => {
    const parsed = intelligenceDatabaseSchema.parse(raw);
    for (const deal of parsed.deals) {
      expect(deal.source_ids.length, `${deal.id} ohne Quelle`).toBeGreaterThan(0);
    }
  });

  it('deckt die geforderten Fallunterscheidungen ab', () => {
    const parsed = intelligenceDatabaseSchema.parse(raw);
    const statuses = new Set(parsed.deals.map((deal) => deal.status));
    for (const status of ['completed', 'announced', 'sale_process', 'rumored'] as const) {
      expect(statuses.has(status), `Status ${status} fehlt im Testdatensatz`).toBe(true);
    }
    // Deutscher und auslaendischer Kaeufer
    const buyerCountries = new Set(
      parsed.deals.flatMap((deal) =>
        deal.buyers
          .map((party) => parsed.companies.find((company) => company.id === party.company_id)?.country)
          .filter((country): country is string => country !== undefined),
      ),
    );
    expect(buyerCountries.has('DE')).toBe(true);
    expect([...buyerCountries].some((country) => country !== 'DE')).toBe(true);
    // Beteiligung statt Vollerwerb
    expect(parsed.deals.some((deal) => deal.deal_type === 'minority_stake')).toBe(true);
    // Deal mit offenem Kaeufer
    expect(parsed.deals.some((deal) => deal.buyers.length === 0)).toBe(true);
  });

  it('erfindet keine Koordinaten', () => {
    const parsed = intelligenceDatabaseSchema.parse(raw);
    for (const company of parsed.companies) {
      if (company.latitude === null) {
        expect(company.coordinate_accuracy, `${company.id}`).toBe('unknown');
      } else {
        expect(company.coordinate_accuracy, `${company.id}`).not.toBe('unknown');
      }
    }
  });

  it('belegt jede Koordinate mit einer auswertbaren Quelle', () => {
    // Der Marktdatensatz fuehrt bei den ergaenzten Emittenten einen Ortsnamen
    // ohne Wikidata-ID. Daraus entstand einmal ein Link auf
    // ".../wiki/undefined" — eine Quelle, die keine ist.
    const parsed = intelligenceDatabaseSchema.parse(raw);
    for (const company of parsed.companies) {
      if (company.latitude === null) continue;
      const url = company.coordinate_source_url;
      expect(url, `${company.id} ohne Koordinatenquelle`).not.toBeNull();
      expect(url, `${company.id}: ${url}`).not.toMatch(/undefined|null/);
    }
  });
});

describe('Die ausgelieferte Deutschland-Seite', () => {
  const dist = resolve(__dirname, '../../site/dist');
  const html = readFileSync(resolve(dist, 'deutschland/index.html'), 'utf8');

  it('verweist nur auf Dateien, die es gibt', () => {
    const referenced = [...html.matchAll(/(?:href|src)="(\/[^"]+)"/g)].map((match) => match[1] ?? '');
    expect(referenced.length).toBeGreaterThan(3);
    for (const path of referenced) {
      expect(() => readFileSync(resolve(dist, path.slice(1))), `${path} fehlt`).not.toThrow();
    }
  });

  it('laedt nichts von fremden Servern', () => {
    expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  });

  it('liest nur Meta-Felder, die das Buendel wirklich hat', () => {
    // Diese Zuordnung ist einmal auseinandergelaufen, ohne dass ein Test es
    // gemerkt hat: das Buendel wurde umbenannt, die Seite las weiter das alte
    // Feld und blieb leer.
    const script = readFileSync(resolve(dist, 'assets/deutschland.js'), 'utf8');
    const used = [...script.matchAll(/\bmeta\.([a-z_]+)/g)].map((match) => match[1] ?? '');
    const bundle = buildMapBundle(database());
    expect(used.length).toBeGreaterThan(0);
    for (const field of new Set(used)) {
      expect(Object.keys(bundle.meta), `meta.${field} gibt es im Buendel nicht`).toContain(field);
    }
  });

  it('zaehlt einen Deal mit deutschem Kaeufer und auslaendischem Ziel nicht zur Karte', () => {
    // Die Karte haengt am Zielunternehmen. Ein deutscher Kaeufer, der im
    // Ausland kauft, gehoert trotzdem zum erfassten Bezug — er darf nicht
    // still verschwinden, sondern wird getrennt ausgewiesen.
    const auslandsziel = { ...exampleTarget, country: 'US' };
    const bundle = buildMapBundle({ ...database(), companies: [exampleBuyer, auslandsziel] });

    expect(bundle.meta.deal_count).toBe(0);
    expect(bundle.meta.buyer_side_count).toBe(1);
  });

  it('zaehlt einen Deal mit deutschem Ziel nicht doppelt', () => {
    const bundle = buildMapBundle(database());
    expect(bundle.meta.deal_count).toBe(1);
    expect(bundle.meta.buyer_side_count).toBe(0);
  });

  it('wird von den bestehenden Seiten aus verlinkt', () => {
    for (const file of ['assets/app.js', 'assets/globe-app.js']) {
      expect(readFileSync(resolve(dist, file), 'utf8')).toContain('href="/deutschland/"');
    }
  });
});
