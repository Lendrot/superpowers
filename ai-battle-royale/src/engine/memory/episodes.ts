/**
 * T22 — Phase 9: Episodisches Gedaechtnis (Doc 03 §6.1, §6.2).
 *
 * Dieselbe Epistemik-Schranke wie bei Perception (Phase 2): eine Episode
 * entsteht **ausschliesslich** hier, und nur fuer Agenten, die im
 * Beobachterset des zugrundeliegenden Events standen
 * (`resolveObservers`, wiederverwendet aus `world/perception.ts` — zwei
 * getrennte Beobachterset-Berechnungen koennten auseinanderlaufen).
 *
 * Anders als Perception braucht Memory KEINE Rundenverzoegerung: Phase 9
 * laeuft nach Phase 6 (Resolution) und Phase 7 (Mutation) DERSELBEN Runde,
 * wenn alle Ortswechsel dieser Runde bereits vollzogen sind — die aktuellen
 * `state.agents`-Positionen sind exakt die Positionen, unter denen die
 * Events dieser Runde entstanden sind. Perception verarbeitet dagegen die
 * Events der VORRUNDE, weil sie vor der eigenen Bewegungsaufloesung laeuft
 * (siehe Kopfkommentar dort).
 *
 * Nur Events aus `EPISODE_BASE` werden zu Episoden — mundane Ereignisse
 * (`rest`, `gather_resource`, `move`, ...) sind fuer eine Episode nicht
 * "sozial genug" (Doc 03 §3.7 nennt als Beispiel "Jonas gab mir Nahrung",
 * nicht "ich erntete"). Ein Event ohne Eintrag hier erzeugt keine Episode,
 * fuer niemanden.
 */

import { aliveAgents, getAgent } from '../core/access.js';
import type { AgentId, Effect, EpisodicMemory, EventType, Round, WorldEvent, WorldState } from '../core/types.js';
import { effect } from '../mutation/effects.js';
import { resolveObservers } from '../world/perception.js';

/**
 * Grundwerte je Event-Typ, aus AKTEURS-/ZIEL-/ZEUGEN-Sicht. **[ANNAHME]**,
 * grob proportional zur sozialen/emotionalen Wucht (Kampf > Buendnis >
 * Handel > Gespraech) — dieselbe Kalibrierungsdisziplin wie bei
 * `RELATIONSHIP_DELTA_TABLE`. Fehlt ein Typ hier, erzeugt er keine Episode.
 *
 * `target` gilt auch fuer die Rolle `told` (Empfaenger von
 * `information_shared`/`information_refused`, siehe `roleFor`) — derselbe
 * Beteiligte, nur anders benannt, keine zweite Zahlenreihe noetig.
 */
const EPISODE_BASE: Partial<Record<EventType, { salience: number; actor: number; target: number; witness: number }>> = {
  agent_attacked: { salience: 0.4, actor: 0.15, target: -0.6, witness: -0.1 },
  agent_killed: { salience: 0.75, actor: 0.25, target: -1, witness: -0.25 },
  agent_eliminated: { salience: 0.5, actor: -0.7, target: 0, witness: -0.15 },
  information_shared: { salience: 0.15, actor: 0.1, target: 0.2, witness: 0.05 },
  information_refused: { salience: 0.2, actor: -0.05, target: -0.2, witness: 0 },
  trade_accepted: { salience: 0.2, actor: 0.25, target: 0.25, witness: 0.05 },
  trade_countered: { salience: 0.1, actor: -0.05, target: -0.05, witness: 0 },
  trade_declined: { salience: 0.15, actor: -0.15, target: 0, witness: 0 },
  alliance_offer_accepted: { salience: 0.35, actor: 0.4, target: 0.4, witness: 0.1 },
  alliance_offer_declined: { salience: 0.2, actor: -0.25, target: 0, witness: 0 },
  alliance_left: { salience: 0.3, actor: -0.1, target: -0.35, witness: -0.05 },
  alliance_expelled: { salience: 0.45, actor: 0.05, target: -0.6, witness: -0.1 },
};

/**
 * `share_information`/`request_information` machen den Empfaenger zu
 * `told`, nicht zu `target` (Doc 03 §3.7: er hat nichts SELBST erlebt,
 * sondern wurde informiert) — inhaltlich derselbe Beteiligte, andere
 * Taxonomie.
 */
const TOLD_EVENT_TYPES = new Set<EventType>(['information_shared', 'information_refused']);

export interface MemoryResult {
  effects: Effect[];
  /** Nur zur Diagnose: wieviele Episoden diese Runde entstanden sind. */
  written: number;
}

/**
 * Baut den Phase-9-Effektbatch: fuer jeden lebenden Agenten ein
 * `episode_upkeep` (Verfall + ggf. Kompaktierung, siehe `stateMutator.ts`),
 * dazu ein `episode_add` je Event, das er in DIESER Runde beobachtet hat.
 */
export function memoryEffects(state: Readonly<WorldState>, roundEvents: readonly WorldEvent[], round: Round): MemoryResult {
  const effects: Effect[] = [];
  let written = 0;

  for (const agent of aliveAgents(state)) {
    effects.push(effect.episodeUpkeep(agent.id));
  }

  for (const event of roundEvents) {
    const base = EPISODE_BASE[event.type];
    if (!base) continue;

    const observers = resolveObservers(event.visibility, state, event);
    if (observers.length === 0) continue;

    const participants = [event.actorId, event.targetId]
      .filter((id): id is AgentId => id !== undefined)
      .sort();
    const summaryKey = `${event.type}:${participants.join('-')}`;
    const allianceInvolved = event.allianceId !== undefined;
    // `pledgeInvolved` (Doc 03 §6.2) ist immer false: `Pledge` existiert
    // erst ab T21.
    const pledgeInvolved = false;

    for (const observerId of observers) {
      // Wer schon gefallen ist, bildet keine neuen Erinnerungen mehr —
      // dieselbe Regel wie bei Wissen (Phase 2) und Beziehungen (Phase 8).
      // `resolveObservers` liefert ohnehin nur Lebende, das hier ist ein
      // zweiter, billiger Beleg dafuer, kein zusaetzlicher Filter.
      const observer = getAgent(state, observerId);
      if (!observer.alive) continue;

      const role = roleFor(event, observerId);
      const valence = role === 'actor' ? base.actor : role === 'witness' ? base.witness : base.target;
      const directlyInvolved = role === 'actor' || role === 'target' || role === 'told';

      // `resourceMagnitudeNorm` (Doc 03 §6.2) fehlt bewusst: sie braucht
      // einen einheitlichen Betrags-Leser ueber alle Event-Payloads hinweg,
      // den es noch nicht gibt. Ohne ihn bleibt der Term 0 statt geraten.
      const salience = clamp01(
        base.salience +
          0.3 * Math.abs(valence) +
          0.2 * (directlyInvolved ? 1 : 0) +
          0.15 * (pledgeInvolved ? 1 : 0) +
          0.15 * (allianceInvolved ? 1 : 0),
      );

      const episode: EpisodicMemory = {
        id: event.id,
        round,
        eventType: event.type,
        participants,
        role,
        valence,
        salience,
        summaryKey,
      };
      effects.push(effect.episodeAdd(observerId, episode));
      written += 1;
    }
  }

  return { effects, written };
}

function roleFor(event: Readonly<WorldEvent>, observerId: AgentId): EpisodicMemory['role'] {
  if (event.actorId === observerId) return 'actor';
  if (event.targetId === observerId) return TOLD_EVENT_TYPES.has(event.type) ? 'told' : 'target';
  return 'witness';
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
