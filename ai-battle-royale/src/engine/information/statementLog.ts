/**
 * T12 — das Gedaechtnis, das R7 ueberhaupt erst pruefbar macht.
 *
 * Doc 08 §8.2.2 R7 verlangt einen Vergleich mit der *letzten* eigenen Aussage
 * zu derselben Info. Der World State fuehrt dafuer `statementLog[agentId][infoId]`
 * — genau einen Eintrag je Paar, nicht die ganze Historie: geprueft wird gegen
 * das zuletzt gezeichnete Bild, nicht gegen alles je Gesagte. Wer vor zwanzig
 * Runden "viel" sagte, dann "wenig", weil sich sein Wissen aenderte, und heute
 * wieder "viel" sagen will, widerspricht dem Zwischenstand, nicht dem Anfang.
 */

import type {
  AgentId,
  InfoId,
  KnowledgeEntry,
  Round,
  Statement,
  StatementLog,
  StatementRecord,
} from '../core/types.js';
import { statementDisclosure, statementInfoId } from './statements.js';

export function lastStatement(
  log: Readonly<StatementLog>,
  agentId: AgentId,
  infoId: InfoId,
): StatementRecord | undefined {
  return log[agentId]?.[infoId];
}

/**
 * Der Eintrag, den eine akzeptierte Aussage hinterlaesst.
 *
 * `believedValueAtTime` ist der Kern: nur damit laesst sich spaeter
 * unterscheiden, ob jemand seine Meinung geaendert hat (erlaubt) oder zwei
 * Bilder zeichnet (Luege). Aussagen ohne Infobezug — Verweigerungen,
 * Absichtserklaerungen — binden niemanden und erzeugen deshalb keinen Eintrag.
 */
export function statementRecordFor(
  statement: Readonly<Statement>,
  entry: Readonly<KnowledgeEntry> | undefined,
  round: Round,
): StatementRecord | null {
  const infoId = statementInfoId(statement);
  if (!infoId || !entry) return null;

  const disclosure = statementDisclosure(statement);
  const record: StatementRecord = {
    infoId,
    kind: statement.kind,
    believedValueAtTime: entry.believedValue,
    round,
  };
  return disclosure ? { ...record, disclosure } : record;
}
