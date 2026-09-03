/**
 * T18 — aus einem `KnowledgeEntry` ein legales `Statement` machen.
 *
 * Gebraucht an zwei Stellen, die sich sonst duplizieren muessten:
 *  - `shareInformation.ts#generate` — der Sender waehlt selbst, was er sagt.
 *  - `requestInformation.ts#resolve` — die Inline-Antwort des Gefragten.
 *
 * Beide muessen dieselbe Regel befolgen (Doc 08 §8.2.2 R2/R5/R6): assertierbar
 * nur bei `observed`/`participated` UND Sicherheit ueber der Schwelle, sonst
 * `hearsay` bei `told_by`, sonst `belief`. Diese Funktion trifft die Wahl
 * einmal, nicht zweimal leicht unterschiedlich.
 */

import type {
  AgentId,
  Disclosure,
  EventId,
  InfoItem,
  InfoValue,
  KnowledgeEntry,
  MatchConfig,
  Round,
  Statement,
} from '../core/types.js';
import { canAssertAsFact, effectiveCertainty, toldEntry } from './knowledge.js';
import { bucketDetailOf, bucketOf, bucketThresholdsFor, impliedValue, meansAbsence, statementDisclosure } from './statements.js';

/**
 * Wie genau die Aussage wird — unabhaengig davon, WELCHE Statement-Art daraus
 * folgt (die entscheidet allein der Wissensstand, siehe oben).
 */
export type Precision = 'exact' | 'bound' | 'qualitative' | 'existence_only';

export function statementFor(
  entry: Readonly<KnowledgeEntry>,
  item: Readonly<InfoItem>,
  round: Round,
  config: Readonly<MatchConfig>,
  precision: Precision,
): Statement {
  const thresholds = bucketThresholdsFor(config.buckets, item.topic, bucketDetailOf(item, item.id));
  const disclosure = disclosureAt(precision, entry.believedValue, thresholds);
  const assertable = canAssertAsFact(entry, item, round, config.info);

  if (assertable && meansAbsence(entry.believedValue)) {
    // R4: Abwesenheit ist eine eigene Aussageform, keine Disclosure-Variante.
    return { kind: 'assert_absence', infoId: item.id };
  }
  if (assertable) {
    return { kind: 'assert_fact', infoId: item.id, disclosure };
  }
  if (entry.source === 'told_by' && entry.sourceAgent) {
    return { kind: 'hearsay', infoId: item.id, sourceAgent: entry.sourceAgent, disclosure };
  }
  // Weder eigene Beobachtung noch attribuierbares Hoerensagen (z. B.
  // `inferred`, R6) — bleibt nur die ausdrueckliche Vermutung.
  return { kind: 'belief', infoId: item.id, hedge: 'not_sure', disclosure };
}

/**
 * T18 — der Wissenstransfer selbst: aus dem, was der Sender glaubt, und der
 * Aussage, die er tatsaechlich macht, den `KnowledgeEntry` bauen, den der
 * Empfaenger bekommt. Von `shareInformation.ts` UND `requestInformation.ts`
 * benutzt — beide muessen dieselbe "mindestens so gut wie das Vorhandene"-Regel
 * befolgen, sonst koennte man sich durch die Wahl der Aktion besseres Wissen
 * erschwindeln, obwohl beide Wege dieselbe Aussage transportieren.
 *
 * `null`, wenn der Empfaenger bereits mindestens so sicher ist — ein
 * rationaler Zuhoerer verwirft eigenes besseres Wissen nicht dafuer, dass ihm
 * gerade eine schwaechere Version erzaehlt wird.
 */
export function deriveToldEntry(params: {
  statement: Readonly<Statement>;
  senderEntry: Readonly<KnowledgeEntry>;
  item: Readonly<InfoItem>;
  round: Round;
  config: Readonly<MatchConfig>;
  sourceAgent: AgentId;
  sourceEventId: EventId;
  existing: Readonly<KnowledgeEntry> | undefined;
}): KnowledgeEntry | null {
  const senderCertainty = effectiveCertainty(params.senderEntry, params.item, params.round, params.config.info);
  const offered = senderCertainty * params.config.info.hearsayRetention;
  const existingCertainty = params.existing
    ? effectiveCertainty(params.existing, params.item, params.round, params.config.info)
    : -1;
  if (offered < existingCertainty) return null;

  // `assert_absence` traegt keine Disclosure — der geglaubte Wert des Senders
  // IST bereits die Abwesenheit, es gibt nichts abzuleiten.
  const disclosure = statementDisclosure(params.statement);
  const believedValue = disclosure
    ? impliedValue(
        disclosure,
        bucketThresholdsFor(params.config.buckets, params.item.topic, bucketDetailOf(params.item, params.item.id)),
        params.item.valueType,
      )
    : params.senderEntry.believedValue;

  return toldEntry({
    infoId: params.item.id,
    believedValue,
    certainty: offered,
    round: params.round,
    sourceAgent: params.sourceAgent,
    sourceEventId: params.sourceEventId,
    previous: params.existing,
  });
}

function disclosureAt(
  precision: Precision,
  value: InfoValue,
  thresholds: ReturnType<typeof bucketThresholdsFor>,
): Disclosure {
  switch (precision) {
    case 'exact':
      return { mode: 'exact', value };
    case 'bound':
      // Nur fuer Zahlen sinnvoll; sonst faellt Genauigkeit auf 'exact' zurueck
      // — bei Booleans/Strings gibt es ohnehin nur einen Wert zu nennen.
      return typeof value === 'number' ? { mode: 'bound', op: '>=', value } : { mode: 'exact', value };
    case 'qualitative':
      return typeof value === 'number'
        ? { mode: 'qualitative', bucket: bucketOf(value, thresholds) }
        : { mode: 'exact', value };
    case 'existence_only':
      return { mode: 'existence_only' };
  }
}
