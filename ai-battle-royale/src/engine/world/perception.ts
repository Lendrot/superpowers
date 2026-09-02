/**
 * T11 — Phase 2: Perception.
 *
 * Die **einzige** Stelle, an der `KnowledgeEntry` entsteht (Doc 02 §2.3,
 * kritische Regel; der zweite Pfad ist ab T18 das Aufloesen von
 * `share_information`). Alles andere im System liest Wissen, schreibt es aber
 * nicht.
 *
 * **Warum das Beobachterset exakt ist, obwohl es eine Runde spaeter bestimmt
 * wird:** Phase 2 der Runde N verarbeitet die Events der Runde N−1 und loest
 * Ortssichtbarkeit gegen die Positionen zu Beginn der Runde N auf. Ortswechsel
 * werden in Phase 6 aufgeloest, und zwar in Klasse 1, also vor allem
 * Ortsabhaengigen (Doc 04 §4.3). Die Positionen zu Beginn von Runde N sind
 * deshalb genau die Positionen, die waehrend der Aufloesung von Runde N−1
 * galten — dieselben, unter denen die Events entstanden sind. Wer in Runde N
 * weiterzieht, tut das erst in deren Phase 6.
 */

import { aliveAgents, getAgent } from '../core/access.js';
import type {
  Agent,
  AgentId,
  Effect,
  InfoItem,
  Round,
  Visibility,
  WorldEvent,
  WorldState,
} from '../core/types.js';
import { observedEntry } from '../information/knowledge.js';
import { resolveTrueValue } from '../information/infoRegistry.js';
import { effect } from '../mutation/effects.js';

/**
 * Wer hat dieses Event mitbekommen? Deckt alle fuenf Scopes aus Doc 03 §3.8 ab.
 * Ausgeschiedene Agenten beobachten nichts.
 */
export function resolveObservers(
  visibility: Readonly<Visibility>,
  state: Readonly<WorldState>,
  event?: Readonly<Pick<WorldEvent, 'actorId' | 'targetId'>>,
): AgentId[] {
  const living = aliveAgents(state);
  const ids = (agents: readonly Agent[]): AgentId[] => agents.map((agent) => agent.id).sort();

  switch (visibility.scope) {
    case 'public':
      return ids(living);

    case 'location':
      return ids(living.filter((agent) => agent.location === visibility.locationId));

    case 'participants': {
      const participants = [event?.actorId, event?.targetId].filter(
        (id): id is AgentId => id !== undefined,
      );
      return ids(living.filter((agent) => participants.includes(agent.id)));
    }

    case 'alliance':
      return ids(living.filter((agent) => agent.allianceId === visibility.allianceId));

    case 'private':
      return ids(living.filter((agent) => visibility.agentIds.includes(agent.id)));
  }
}

export interface PerceptionResult {
  effects: Effect[];
  /** Nur zur Diagnose: wieviele Wissenseintraege diese Runde entstanden sind. */
  written: number;
}

/**
 * Macht aus den Events der Vorrunde Wissen.
 *
 * Ein Event erzeugt nur dann Wissen, wenn es `infoRefs` traegt — Sichtbarkeit
 * allein genuegt nicht. Wer eine Ernte sieht, erfaehrt etwas ueber den Bestand
 * am Ort; wer jemanden ruhen sieht, erfaehrt nichts, was sich speichern liesse.
 */
export function perceptionEffects(
  state: Readonly<WorldState>,
  previousRoundEvents: readonly WorldEvent[],
  round: Round,
): PerceptionResult {
  const effects: Effect[] = [];
  let written = 0;

  for (const event of previousRoundEvents) {
    if (event.infoRefs.length === 0) continue;

    const observers = resolveObservers(event.visibility, state, event);
    if (observers.length === 0) continue;

    for (const infoId of event.infoRefs) {
      const item: InfoItem | undefined = state.infoRegistry[infoId];
      if (!item) {
        throw new Error(
          `Event ${event.id} verweist auf die unbekannte Info ${infoId} — ` +
            'jede referenzierte InfoId muss im Registry existieren (Doc 03 §3.1).',
        );
      }

      // Das Event bestimmt, WELCHE Tatsache jemand erfaehrt; den Wert liest er
      // aus der Gegenwart, weil er jetzt dort steht. Wer eine Ernte gesehen hat
      // und geblieben ist, weiss, was noch da liegt — nicht, was vor einer
      // Runde da lag.
      const trueValue = resolveTrueValue(state, infoId);
      if (trueValue === undefined) continue;

      for (const observerId of observers) {
        const observer = getAgent(state, observerId);
        effects.push(
          effect.knowledge(
            observerId,
            observedEntry({
              infoId,
              believedValue: trueValue,
              round,
              // Wer selbst gehandelt hat, hat teilgenommen; alle anderen haben zugesehen.
              source: event.actorId === observerId ? 'participated' : 'observed',
              sourceEventId: event.id,
              previous: observer.knowledge[infoId],
            }),
          ),
        );
        written += 1;
      }
    }
  }

  return { effects, written };
}
