/**
 * T19 — Doc 03 §3.3: `RELATIONSHIP_DELTA_TABLE` und ihre Anwendung in Phase 8.
 *
 * Beziehungswerte aendern sich **ausschliesslich** ueber diese Tabelle,
 * moduliert durch die Persoenlichkeit des Wahrnehmenden — nie durch eine
 * direkte Zuweisung irgendwo im Code. Ohne LLM entfaellt das in Doc 03 §3.3
 * beschriebene Clamping von LLM-Vorschlaegen; was bleibt, ist die Tabelle
 * selbst, tabellarisch nachvollziehbar wie die Bucket-Grenzen aus Doc 08 §8.2.2.
 *
 * Ein Ereignis zwischen zwei Agenten veraendert **beide** Richtungen, meist
 * unterschiedlich: wer hilft, gewinnt selbst nur wenig Vertrauen, wer Hilfe
 * empfaengt, viel. Deshalb traegt jeder Tabelleneintrag zwei Deltas.
 *
 * Alle Zahlen sind **[ANNAHME]** und Kalibrierungsmasse (T43), wie die Werte in
 * `core/config.ts`.
 */

import { getAgent } from '../core/access.js';
import { defaultRelationship } from '../core/relationship.js';
import type {
  AgentId,
  EventType,
  Personality,
  Relationship,
  RelationshipStats,
  WorldEvent,
  WorldState,
} from '../core/types.js';
import { RELATIONSHIP_STATS } from '../core/types.js';
import { effect } from '../mutation/effects.js';
import type { Effect } from '../core/types.js';

interface DeltaPair {
  /** Wie sich AKTEURS Sicht auf das ZIEL veraendert. */
  actorToTarget?: Partial<RelationshipStats>;
  /** Wie sich ZIELS Sicht auf den AKTEUR veraendert. */
  targetToActor?: Partial<RelationshipStats>;
}

/**
 * Doc 03 §3.3. Nur Ereignisse mit `actorId` UND `targetId` koennen hier stehen
 * — ohne zwei Beteiligte gibt es keine gerichtete Beziehung zu aendern.
 *
 * `agent_attacked`/`agent_killed` fehlen bewusst nicht: Gewalt ist die
 * eindeutigste Beziehungsfolge, die es gibt.
 */
export const RELATIONSHIP_DELTA_TABLE: Partial<Record<EventType, DeltaPair>> = {
  agent_attacked: {
    // Der Verlierer erfaehrt hier nichts ueber Sieg/Niederlage — das steht im
    // Payload, nicht im Typ. Der Effekt gilt fuer BEIDE Rollen gleich: wer
    // angegriffen hat und wer angegriffen wurde, veraendert sich gegenseitig.
    actorToTarget: { rivalry: 6, respect: 2 },
    targetToActor: { fear: 12, trust: -10, rivalry: 8 },
  },
  agent_killed: {
    // Nur der Sieger bleibt uebrig, um etwas zu empfinden — das Opfer scheidet
    // aus. `targetToActor` traegt dennoch die volle Wucht: witnesses lesen
    // dieselbe Tabelle spaeter aus Episoden (T22), nicht aus dieser Richtung.
    actorToTarget: { rivalry: 10 },
    targetToActor: { fear: 25, trust: -25 },
  },
  information_shared: {
    // Wer teilt, gewinnt selbst wenig — er kennt sein eigenes Wissen schon.
    actorToTarget: { trust: 1 },
    targetToActor: { trust: 6, friendship: 3 },
  },
  // Doc 08 §8.2.2 R9, woertlich: "Sie kosten nichts ausser sozialen
  // Konsequenzen (suspicion+, trust- beim Fragenden, moduliert durch dessen
  // Persoenlichkeit)." `actorId`/`targetId` sind hier Antwortender/Fragender
  // (siehe `requestInformation.ts`) — der Fragende ist also `targetToActor`.
  information_refused: {
    targetToActor: { suspicion: 8, trust: -3 },
  },
  trade_accepted: {
    actorToTarget: { trust: 5, friendship: 3 },
    targetToActor: { trust: 5, friendship: 3 },
  },
  // Reiner Marker (siehe `EventType`), trotzdem nicht folgenlos: Verhandeln
  // zeigt, dass der Erstanbieter nicht getroffen hat, was gebraucht wurde.
  trade_countered: {
    actorToTarget: { respect: 1 },
    targetToActor: { respect: 1 },
  },
  trade_declined: {
    actorToTarget: { rivalry: 2 },
  },
  // T20. Beitritt ist ein beidseitig kostspieliges Bekenntnis (Doc 04 §4.1 Nr.
  // 8) — deutlich staerker als ein einzelner Handel, deshalb ueber
  // `trade_accepted` angesiedelt, aber unter dem, was Kampf oder Verrat
  // bewegt.
  alliance_offer_accepted: {
    actorToTarget: { trust: 8, friendship: 5 },
    targetToActor: { trust: 8, friendship: 5, respect: 3 },
  },
  // Wie `trade_declined`: nur der Zurueckgewiesene traegt etwas davon.
  alliance_offer_declined: {
    actorToTarget: { rivalry: 2 },
  },
  // `actorId` ist die/der Gehende, `targetId` je ein verbleibendes Mitglied —
  // ein Event pro Person (siehe `leaveAllianceAction`). "Harte Trust-Deltas
  // bei Ex-Mitgliedern" (Doc 04 §4.1 Nr. 9) steht in `targetToActor`.
  alliance_left: {
    actorToTarget: { respect: -2 },
    targetToActor: { trust: -12, suspicion: 6, respect: -5 },
  },
  // `actorId` ist der Leader, `targetId` das ausgeschlossene Mitglied.
  alliance_expelled: {
    actorToTarget: { suspicion: 3 },
    targetToActor: { fear: 10, trust: -20, rivalry: 10 },
  },
};

/**
 * Vier Dimensionen sind Waerme — wie schnell jemand sich oeffnet, wenn es dazu
 * Grund gibt. Nur bei IHNEN verstaerkt Empathie einen Anstieg (Doc 03 §3.3).
 * `fear` und `rivalry` sind numerisch positiv, aber keine Waerme, sondern
 * Bedrohung — ein aengstlicher Ausschlag wird nicht dadurch kleiner, dass das
 * Opfer mitfuehlend ist.
 */
const WARMTH_STATS = ['trust', 'friendship', 'respect', 'attraction'] as const satisfies readonly (keyof RelationshipStats)[];

/**
 * Ein Anstieg von Waerme (`trust`, `friendship`, ...) verstaerkt Empathie,
 * ein Anstieg von `suspicion` daempft Loyalitaet (Doc 03 §3.3, woertliches
 * Beispiel). Alles andere — `fear`, `rivalry`, jeder Rueckgang, `debt` als
 * Tatsache statt Empfindung — bleibt unmoduliert.
 */
export function modulateByPersonality(
  perceiver: Readonly<Personality>,
  delta: Readonly<Partial<RelationshipStats>>,
): Partial<RelationshipStats> {
  const out: Partial<RelationshipStats> = {};
  if (delta.debt) out.debt = delta.debt;

  for (const stat of RELATIONSHIP_STATS) {
    const raw = delta[stat];
    if (raw === undefined || raw === 0) continue;

    if (stat === 'suspicion' && raw > 0) {
      // 1 - loyalty: bei voller Loyalitaet fast kein zusaetzlicher Argwohn,
      // bei fehlender Loyalitaet fast das Doppelte.
      out.suspicion = Math.round(raw * (0.6 + 0.8 * (1 - perceiver.loyalty / 100)));
      continue;
    }
    if (raw > 0 && (WARMTH_STATS as readonly string[]).includes(stat)) {
      out[stat] = Math.round(raw * (0.7 + 0.6 * (perceiver.empathy / 100)));
    } else {
      out[stat] = raw;
    }
  }
  return out;
}

/**
 * Phase 8: uebersetzt die Ereignisse einer Runde in `relationship`-Effekte.
 * Rein und deterministisch — dieselbe Bauart wie `consequence.ts`, mit dem sie
 * zusammen aufgerufen wird.
 */
export function relationshipEffectsFor(
  state: Readonly<WorldState>,
  roundEvents: readonly WorldEvent[],
): Effect[] {
  const effects: Effect[] = [];

  for (const event of roundEvents) {
    const pair = RELATIONSHIP_DELTA_TABLE[event.type];
    if (!pair || !event.actorId || !event.targetId) continue;
    const actor = getAgent(state, event.actorId);
    const target = getAgent(state, event.targetId);
    // Wer schon gefallen ist, empfindet nichts mehr und wird nicht mehr
    // beurteilt — dieselbe Regel wie beim Kampf selbst (Phase 6).
    if (!actor.alive || !target.alive) continue;

    if (pair.actorToTarget) {
      const modulated = modulateByPersonality(actor.personality, pair.actorToTarget);
      if (Object.keys(modulated).length > 0) {
        effects.push(effect.relationship(actor.id, target.id, modulated, event.type));
      }
    }
    if (pair.targetToActor) {
      const modulated = modulateByPersonality(target.personality, pair.targetToActor);
      if (Object.keys(modulated).length > 0) {
        effects.push(effect.relationship(target.id, actor.id, modulated, event.type));
      }
    }
  }

  return effects;
}

/** Fuer Views und Tests: die Beziehung eines Agenten zu einem anderen, nie `undefined`. */
export function relationshipOf(state: Readonly<WorldState>, from: AgentId, to: AgentId): Relationship {
  return getAgent(state, from).relationships[to] ?? defaultRelationship();
}
