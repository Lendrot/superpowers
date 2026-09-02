/**
 * T12 — `entails` und die Bucket-Tabelle.
 *
 * Der Satz, an dem die ganze Regel haengt (Doc 08 §8.2.2 R3): die Behauptung
 * muss den geglaubten Wert **enthalten**. "Ich habe Geld" ist bei 100 Muenzen
 * wahr, "ich habe fast kein Geld" nicht — beide Saetze meinen dieselbe Zahl.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_BUCKETS } from '@/engine/core/config.js';
import type { BucketThresholds } from '@/engine/core/types.js';
import {
  bucketDetailOf,
  bucketOf,
  bucketThresholdsFor,
  claimOf,
  claimsContradict,
  entails,
  isRefusal,
  meansAbsence,
  meansPresence,
  statementDisclosure,
  statementInfoId,
} from '@/engine/information/statements.js';
import { agentResourceInfoId, agentResourceInfoItem, stockInfoItem } from '@/engine/information/infoRegistry.js';

/** Doc 08 §8.2.2 woertlich: none 0–5, some 6–49, much ab 50. */
const coins: BucketThresholds = bucketThresholdsFor(DEFAULT_BUCKETS, 'agent_resource', 'coins');

describe('Bucket-Grenzen (Doc 08 §8.2.2)', () => {
  it('nimmt die genauere Angabe, wenn es eine gibt', () => {
    expect(coins).toEqual({ some: 6, much: 50 });
    expect(bucketThresholdsFor(DEFAULT_BUCKETS, 'agent_resource')).toEqual({ some: 1, much: 20 });
  });

  it('setzt die Grenzen unten einschliessend und oben ausschliessend', () => {
    expect(bucketOf(0, coins)).toBe('none');
    expect(bucketOf(5, coins)).toBe('none');
    expect(bucketOf(6, coins)).toBe('some');
    expect(bucketOf(49, coins)).toBe('some');
    expect(bucketOf(50, coins)).toBe('much');
    expect(bucketOf(100, coins)).toBe('much');
  });

  it('liest das Detail aus der InfoId, nicht aus einem zweiten Feld', () => {
    const item = agentResourceInfoItem('agent_000', 'coins', 1);
    expect(bucketDetailOf(item, agentResourceInfoId('agent_000', 'coins'))).toBe('coins');
    // Themen ohne Ressourcenbezug haben kein Detail — sonst faende die Suche
    // zufaellig einen Schluessel, der etwas ganz anderes meint.
    expect(bucketDetailOf(stockInfoItem('fields', 'food', 1), 'info_attr_agent_000_strength')).toBe(
      'strength',
    );
  });

  it('wirft, statt still ein Default zu erfinden, wenn ein Thema keine Grenzen hat', () => {
    expect(() => bucketThresholdsFor({}, 'agent_resource')).toThrow(/Bucket-Grenzen/);
  });
});

describe('entails — der Fall aus der Regel', () => {
  it('"Ich habe Geld" ist bei 100 Muenzen wahr', () => {
    expect(entails({ mode: 'existence_only' }, 100, coins)).toBe(true);
  });

  it('"Ich habe fast kein Geld" ist bei 100 Muenzen falsch', () => {
    expect(entails({ mode: 'qualitative', bucket: 'none' }, 100, coins)).toBe(false);
  });

  it('exact trifft nur den Wert selbst', () => {
    expect(entails({ mode: 'exact', value: 20 }, 20, coins)).toBe(true);
    expect(entails({ mode: 'exact', value: 19 }, 20, coins)).toBe(false);
  });

  it('bound schliesst die Grenze ein', () => {
    expect(entails({ mode: 'bound', op: '>=', value: 20 }, 20, coins)).toBe(true);
    expect(entails({ mode: 'bound', op: '>=', value: 21 }, 20, coins)).toBe(false);
    expect(entails({ mode: 'bound', op: '<=', value: 20 }, 20, coins)).toBe(true);
    expect(entails({ mode: 'bound', op: '<=', value: 19 }, 20, coins)).toBe(false);
  });

  it('existence_only ist bei 0 falsch — "da ist etwas" braucht etwas', () => {
    expect(entails({ mode: 'existence_only' }, 0, coins)).toBe(false);
    expect(meansPresence(0)).toBe(false);
    expect(meansAbsence(0)).toBe(true);
    expect(meansPresence(true)).toBe(true);
    expect(meansAbsence(false)).toBe(true);
    expect(meansPresence('')).toBe(false);
  });

  it('bound und qualitative ergeben fuer nicht-numerische Ueberzeugungen nichts', () => {
    // Bei `event_occurred` ist der geglaubte Wert `true`. "Mindestens 10" waere
    // dazu keine falsche Aussage, sondern gar keine.
    expect(entails({ mode: 'bound', op: '>=', value: 10 }, true, coins)).toBe(false);
    expect(entails({ mode: 'qualitative', bucket: 'much' }, true, coins)).toBe(false);
    expect(entails({ mode: 'exact', value: true }, true, coins)).toBe(true);
    expect(entails({ mode: 'existence_only' }, true, coins)).toBe(true);
  });
});

describe('claimsContradict — die Rechnung hinter R7', () => {
  const claim = (bucket: 'none' | 'some' | 'much') =>
    claimOf('assert_fact', { mode: 'qualitative', bucket }, coins);

  it('benachbarte Buckets ueberschneiden sich nicht', () => {
    expect(claimsContradict(claim('none'), claim('some'))).toBe(true);
    expect(claimsContradict(claim('some'), claim('much'))).toBe(true);
    expect(claimsContradict(claim('none'), claim('much'))).toBe(true);
  });

  it('derselbe Bucket widerspricht sich nicht', () => {
    expect(claimsContradict(claim('much'), claim('much'))).toBe(false);
  });

  it('"etwas" und "nichts" vertragen sich nie', () => {
    const present = claimOf('assert_fact', { mode: 'existence_only' }, coins);
    const absent = claimOf('assert_absence', undefined, coins);
    expect(claimsContradict(present, absent)).toBe(true);
    expect(claimsContradict(present, claim('none'))).toBe(false); // 1..5 ist beides
    expect(claimsContradict(absent, claim('some'))).toBe(true);
  });

  it('sich ueberlappende Schranken sind kein Widerspruch', () => {
    const atLeast10 = claimOf('assert_fact', { mode: 'bound', op: '>=', value: 10 }, coins);
    const atMost50 = claimOf('assert_fact', { mode: 'bound', op: '<=', value: 50 }, coins);
    const atMost5 = claimOf('assert_fact', { mode: 'bound', op: '<=', value: 5 }, coins);
    expect(claimsContradict(atLeast10, atMost50)).toBe(false);
    expect(claimsContradict(atLeast10, atMost5)).toBe(true);
    // Genau ein gemeinsamer Punkt reicht: 10 erfuellt beides.
    const atMost10 = claimOf('assert_fact', { mode: 'bound', op: '<=', value: 10 }, coins);
    expect(claimsContradict(atLeast10, atMost10)).toBe(false);
  });

  it('eine Verweigerung behauptet nichts und kann nichts widersprechen', () => {
    const silent = claimOf('refuse_to_answer', null, coins);
    expect(claimsContradict(silent, claim('much'))).toBe(false);
  });
});

describe('Zerlegung einer Aussage', () => {
  it('findet den Infobezug nur, wo es einen gibt', () => {
    expect(statementInfoId({ kind: 'assert_absence', infoId: 'info_x' })).toBe('info_x');
    expect(statementInfoId({ kind: 'refuse_to_answer', topic: 'agent_resource' })).toBeNull();
    expect(statementInfoId({ kind: 'declare_intent', intent: 'ich helfe' })).toBeNull();
  });

  it('assert_absence traegt keine Disclosure — die Abwesenheit ist die Aussage', () => {
    expect(statementDisclosure({ kind: 'assert_absence', infoId: 'info_x' })).toBeNull();
  });

  it('erkennt die fuenf Formen, die nichts behaupten (R9)', () => {
    expect(isRefusal({ kind: 'withhold', topic: 'agent_resource' })).toBe(true);
    expect(isRefusal({ kind: 'none' })).toBe(true);
    expect(isRefusal({ kind: 'declare_intent', intent: 'x' })).toBe(false);
    expect(isRefusal({ kind: 'assert_absence', infoId: 'info_x' })).toBe(false);
  });
});
