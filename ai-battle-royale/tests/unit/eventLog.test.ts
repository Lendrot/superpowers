import { describe, expect, it } from 'vitest';

import { createEventLog, hashEvents, isEventType } from '@/engine/core/eventLog.js';
import type { EventDraft } from '@/engine/core/eventLog.js';
import { worldEventSchema } from '@/engine/core/schemas.js';
import { EVENT_TYPES } from '@/engine/core/types.js';
import type { MatchId } from '@/engine/core/types.js';

const MATCH: MatchId = 'match_test';

function draft(round: number, type: EventDraft['type'], payload: Record<string, number> = {}): EventDraft {
  return {
    round,
    type,
    locationId: 'commons',
    payload,
    visibility: { scope: 'public' },
    infoRefs: [],
  };
}

describe('eventLog — Anhaengen', () => {
  it('vergibt fortlaufende Sequenznummern und stabile IDs', () => {
    const log = createEventLog(MATCH);
    const first = log.append(draft(1, 'round_started'));
    const second = log.append(draft(1, 'agent_rested'));

    expect(first.seq).toBe(0);
    expect(second.seq).toBe(1);
    expect(first.id).toBe('event_0001_00000');
    expect(second.id).toBe('event_0001_00001');
    expect(first.matchId).toBe(MATCH);
    expect(log.size).toBe(2);
    expect(log.nextSeq).toBe(2);
  });

  it('erzeugt Events, die dem Schema genuegen', () => {
    const log = createEventLog(MATCH);
    const event = log.append(draft(3, 'resource_gathered', { amount: 2 }));
    expect(worldEventSchema.safeParse(event).success).toBe(true);
  });

  it('filtert nach Runde', () => {
    const log = createEventLog(MATCH);
    log.append(draft(1, 'round_started'));
    log.append(draft(2, 'round_started'));
    log.append(draft(2, 'round_ended'));

    expect(log.byRound(2).map((e) => e.type)).toEqual(['round_started', 'round_ended']);
  });

  it('zaehlt nach Typ', () => {
    const log = createEventLog(MATCH);
    log.append(draft(1, 'agent_rested'));
    log.append(draft(1, 'agent_rested'));
    log.append(draft(1, 'round_ended'));

    expect(log.countByType()).toEqual({ agent_rested: 2, round_ended: 1 });
  });
});

describe('eventLog — Hash', () => {
  it('ist stabil fuer dieselbe Folge', () => {
    const build = (): string => {
      const log = createEventLog(MATCH);
      log.append(draft(1, 'round_started'));
      log.append(draft(1, 'agent_rested', { energyGain: 5 }));
      return log.hash;
    };
    expect(build()).toBe(build());
  });

  it('haengt an der Reihenfolge', () => {
    const a = createEventLog(MATCH);
    a.append(draft(1, 'round_started'));
    a.append(draft(1, 'agent_rested'));

    const b = createEventLog(MATCH);
    b.append(draft(1, 'agent_rested'));
    b.append(draft(1, 'round_started'));

    expect(a.hash).not.toBe(b.hash);
  });

  it('aendert sich mit jedem angehaengten Event', () => {
    const log = createEventLog(MATCH);
    const empty = log.hash;
    log.append(draft(1, 'round_started'));
    const one = log.hash;
    log.append(draft(1, 'round_ended'));

    expect(new Set([empty, one, log.hash]).size).toBe(3);
  });

  it('trennt Matches: gleiche Events, andere MatchId, anderer Hash', () => {
    const a = createEventLog('match_a');
    const b = createEventLog('match_b');
    a.append(draft(1, 'round_started'));
    b.append(draft(1, 'round_started'));

    expect(a.hash).not.toBe(b.hash);
  });

  it('hashEvents rechnet dasselbe wie der rollende Hash', () => {
    const log = createEventLog(MATCH);
    log.append(draft(1, 'round_started'));
    log.append(draft(1, 'resource_gathered', { amount: 3 }));
    log.append(draft(2, 'round_ended'));

    expect(hashEvents(MATCH, log.events)).toBe(log.hash);
  });
});

describe('eventLog — EVENT_TYPES ist die einzige Quelle', () => {
  /**
   * Fix 4 (Opus-Review): `EventType`, `isEventType` und `worldEventSchema`
   * pflegten je eine eigene Aufzaehlung. Sie liefen auseinander — dem Schema
   * fehlten die fuenf Tag-4-Typen (`information_shared`, `information_refused`,
   * `trade_accepted`, `trade_countered`, `trade_declined`), obwohl `isEventType`
   * und der `EventType`-Unionstyp sie kannten. Jetzt leiten sich alle drei von
   * `EVENT_TYPES` ab — dieser Test iteriert genau darueber, statt eine vierte,
   * separat gepflegte Liste anzulegen.
   */
  it.each(EVENT_TYPES)('%s ist fuer isEventType UND worldEventSchema gueltig', (type) => {
    expect(isEventType(type)).toBe(true);
    const event = createEventLog(MATCH).append(draft(1, type));
    expect(worldEventSchema.safeParse(event).success).toBe(true);
  });

  it('kein Event-Typ existiert nur im Schema oder nur in EVENT_TYPES', () => {
    const schemaTypes = worldEventSchema.shape.type.options as readonly string[];
    expect(new Set(schemaTypes)).toEqual(new Set(EVENT_TYPES));
  });
});
