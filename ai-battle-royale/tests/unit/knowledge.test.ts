import { describe, expect, it } from 'vitest';

import { DEFAULT_INFO } from '@/engine/core/config.js';
import type { InfoItem, KnowledgeEntry } from '@/engine/core/types.js';
import {
  canAssertAsFact,
  decayPerRound,
  effectiveCertainty,
  observedEntry,
} from '@/engine/information/knowledge.js';
import { eventInfoItem, stockInfoItem } from '@/engine/information/infoRegistry.js';

const fastItem = stockInfoItem('fields', 'food', 1);
const staticItem = eventInfoItem('eliminated_agent_000', 1);
const slowItem: InfoItem = { ...fastItem, id: 'info_slow', volatility: 'slow' };

function entry(patch: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    infoId: fastItem.id,
    believedValue: 20,
    certainty: 1,
    source: 'observed',
    acquiredRound: 5,
    lastConfirmedRound: 5,
    sharedWith: [],
    isSecret: false,
    ...patch,
  };
}

describe('Veralten von Wissen (Doc 03 §3.4.2)', () => {
  it('nutzt die Verfallsrate der Volatilitaet', () => {
    expect(decayPerRound(fastItem, DEFAULT_INFO)).toBe(0.05);
    expect(decayPerRound(slowItem, DEFAULT_INFO)).toBe(0.01);
    expect(decayPerRound(staticItem, DEFAULT_INFO)).toBe(0);
  });

  it('faellt linear mit den vergangenen Runden', () => {
    expect(effectiveCertainty(entry(), fastItem, 5, DEFAULT_INFO)).toBeCloseTo(1);
    expect(effectiveCertainty(entry(), fastItem, 6, DEFAULT_INFO)).toBeCloseTo(0.95);
    expect(effectiveCertainty(entry(), fastItem, 10, DEFAULT_INFO)).toBeCloseTo(0.75);
  });

  it('faellt nie unter null', () => {
    expect(effectiveCertainty(entry(), fastItem, 500, DEFAULT_INFO)).toBe(0);
  });

  it('laesst statisches Wissen unangetastet', () => {
    // Ein Ereignis, das stattgefunden hat, hoert nicht wieder auf stattgefunden
    // zu haben.
    expect(effectiveCertainty(entry(), staticItem, 400, DEFAULT_INFO)).toBe(1);
  });

  it('veraltet langsames Wissen langsamer als schnelles', () => {
    const slow = effectiveCertainty(entry(), slowItem, 25, DEFAULT_INFO);
    const fast = effectiveCertainty(entry(), fastItem, 25, DEFAULT_INFO);
    expect(slow).toBeGreaterThan(fast);
  });

  it('rechnet nie in die Zukunft', () => {
    expect(effectiveCertainty(entry({ lastConfirmedRound: 20 }), fastItem, 5, DEFAULT_INFO)).toBe(1);
  });
});

describe('Behaupten als Tatsache (Vorbereitung R2/R6)', () => {
  it('erlaubt frische eigene Beobachtung', () => {
    expect(canAssertAsFact(entry(), fastItem, 5, DEFAULT_INFO)).toBe(true);
  });

  it('verbietet es, sobald die Sicherheit unter die Schwelle faellt', () => {
    // 0.80 ist erreicht bei 4 Runden Verfall (1 - 4*0.05), bei 5 Runden nicht mehr.
    expect(canAssertAsFact(entry(), fastItem, 9, DEFAULT_INFO)).toBe(true);
    expect(canAssertAsFact(entry(), fastItem, 10, DEFAULT_INFO)).toBe(false);
  });

  it('verbietet es fuer Hoerensagen — unabhaengig von der Sicherheit', () => {
    const hearsay = entry({ source: 'told_by', sourceAgent: 'agent_001', certainty: 1 });
    expect(canAssertAsFact(hearsay, fastItem, 5, DEFAULT_INFO)).toBe(false);
  });

  it('verbietet es fuer Geschlussfolgertes (R6)', () => {
    expect(canAssertAsFact(entry({ source: 'inferred' }), fastItem, 5, DEFAULT_INFO)).toBe(false);
  });
});

describe('observedEntry', () => {
  it('setzt volle Sicherheit fuer eigene Beobachtung', () => {
    const created = observedEntry({
      infoId: fastItem.id,
      believedValue: 12,
      round: 7,
      source: 'observed',
      sourceEventId: 'event_0006_00003',
    });

    expect(created.certainty).toBe(1);
    expect(created.acquiredRound).toBe(7);
    expect(created.lastConfirmedRound).toBe(7);
    expect(created.sourceEventId).toBe('event_0006_00003');
  });

  it('behaelt die erste Begegnung, wenn schon etwas bekannt war', () => {
    const previous = entry({ acquiredRound: 2, sharedWith: ['agent_009'], isSecret: true });
    const updated = observedEntry({
      infoId: fastItem.id,
      believedValue: 3,
      round: 11,
      source: 'observed',
      sourceEventId: 'event_0010_00001',
      previous,
    });

    expect(updated.acquiredRound).toBe(2);
    expect(updated.lastConfirmedRound).toBe(11);
    expect(updated.believedValue).toBe(3);
    expect(updated.sharedWith).toEqual(['agent_009']);
    expect(updated.isSecret).toBe(true);
  });
});
