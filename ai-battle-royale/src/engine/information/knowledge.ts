/**
 * T10 — `KnowledgeEntry`, Sicherheit und Veralten.
 *
 * Doc 03 §3.4.2: bei `volatility: 'fast'` sinkt `certainty` pro Runde um
 * `decayFast`, bei `'slow'` um `decaySlow`, bei `'static'` gar nicht.
 *
 * Umgesetzt als Rechnung beim Lesen, nicht als Effekt pro Runde. 30 Agenten mit
 * je 20 Eintraegen ueber 400 Runden waeren 240 000 Effekte, die nichts tun
 * ausser eine Zahl zu verkleinern — und jeder davon muesste durch die
 * Validierungskette. Das gespeicherte `certainty` gilt fuer
 * `lastConfirmedRound`; was heute gilt, rechnet `effectiveCertainty` aus.
 */

import type { InfoConfig, InfoItem, KnowledgeEntry, Round, Score01 } from '../core/types.js';

export function decayPerRound(item: Readonly<InfoItem>, config: Readonly<InfoConfig>): number {
  switch (item.volatility) {
    case 'fast':
      return config.decayFast;
    case 'slow':
      return config.decaySlow;
    case 'static':
      return 0;
  }
}

/**
 * Die Sicherheit, die in `round` tatsaechlich gilt.
 * Faellt linear und nie unter 0.
 */
export function effectiveCertainty(
  entry: Readonly<KnowledgeEntry>,
  item: Readonly<InfoItem>,
  round: Round,
  config: Readonly<InfoConfig>,
): Score01 {
  const elapsed = Math.max(0, round - entry.lastConfirmedRound);
  const decayed = entry.certainty - decayPerRound(item, config) * elapsed;
  return decayed <= 0 ? 0 : decayed;
}

/**
 * Doc 08 §8.2.2 R2 + R6: als Tatsache behaupten darf nur, wer selbst beobachtet
 * oder teilgenommen hat UND die Sicherheitsschwelle erreicht. Hoerensagen und
 * Schlussfolgerung erreichen sie per Konstruktion nie.
 *
 * Der Truth-Validator (T13) baut darauf auf; die Funktion steht hier, weil sie
 * eine Eigenschaft des Wissens ist, keine der Aussage.
 */
export function canAssertAsFact(
  entry: Readonly<KnowledgeEntry>,
  item: Readonly<InfoItem>,
  round: Round,
  config: Readonly<InfoConfig>,
): boolean {
  if (entry.source !== 'observed' && entry.source !== 'participated') return false;
  return effectiveCertainty(entry, item, round, config) >= config.assertCertaintyThreshold;
}

/** Sicherheit, mit der ein Wert bei eigener Beobachtung uebernommen wird. */
export const OBSERVED_CERTAINTY = 1;

/**
 * Baut den Eintrag, den Phase 2 schreibt. Kein anderer Pfad darf einen
 * `KnowledgeEntry` erzeugen (Doc 02 §2.3, kritische Regel).
 */
export function observedEntry(params: {
  infoId: KnowledgeEntry['infoId'];
  believedValue: KnowledgeEntry['believedValue'];
  round: Round;
  source: 'observed' | 'participated';
  sourceEventId: KnowledgeEntry['sourceEventId'];
  previous?: Readonly<KnowledgeEntry> | undefined;
}): KnowledgeEntry {
  return {
    infoId: params.infoId,
    believedValue: params.believedValue,
    certainty: OBSERVED_CERTAINTY,
    source: params.source,
    sourceEventId: params.sourceEventId,
    // Erste Begegnung merkt sich die Runde; spaetere Bestaetigungen nicht mehr.
    acquiredRound: params.previous?.acquiredRound ?? params.round,
    lastConfirmedRound: params.round,
    sharedWith: params.previous ? [...params.previous.sharedWith] : [],
    isSecret: params.previous?.isSecret ?? false,
  };
}
