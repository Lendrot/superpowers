/**
 * Phase 1 — Upkeep. Vollstaendig deterministisch, kein RNG.
 *
 * Ortsregeneration, Saettigungsverfall, passive Energie-Regeneration,
 * Hunger-/Erschoepfungszaehler und Ausscheiden (T08).
 *
 * Die Reihenfolge innerhalb der Phase ist festgelegt: erst Regeneration, dann
 * Beduerfnisse, dann Ausscheiden. Wer in dieser Runde verhungert, hat vorher
 * noch regeneriert — sonst haenge das Ergebnis daran, in welcher Reihenfolge
 * die Effekte zufaellig im Batch stehen.
 */

import { aliveAgents, locationIds } from '../core/access.js';
import { RESOURCE_KINDS } from '../core/resources.js';
import type { EventDraft } from '../core/eventLog.js';
import type { Effect, EliminationCause, WorldState } from '../core/types.js';
import { eventInfoId, eventInfoItem } from '../information/infoRegistry.js';
import { effect } from '../mutation/effects.js';

export interface UpkeepResult {
  effects: Effect[];
  /** Ausscheiden ist ein Ereignis, das alle erfahren — anders als Hunger. */
  events: EventDraft[];
}

export function upkeep(state: Readonly<WorldState>): UpkeepResult {
  const effects: Effect[] = [];
  const events: EventDraft[] = [];
  const { satietyDecayPerRound, energyRegenPerRound, starvationRounds, exhaustionRounds } =
    state.config.economy;

  // ── Orte regenerieren ─────────────────────────────────────────────────────
  // Das Kappen an der Kapazitaet gehoert hierher, nicht in den Mutator: nur wer
  // den Effekt erzeugt, kann ihn so formulieren, dass erwartete und
  // tatsaechliche Aenderung uebereinstimmen.
  for (const id of locationIds(state)) {
    const location = state.locations[id];
    if (!location) continue;

    const delta: Partial<Record<(typeof RESOURCE_KINDS)[number], number>> = {};
    let any = false;
    for (const kind of RESOURCE_KINDS) {
      const regen = location.regenPerRound[kind] ?? 0;
      if (regen <= 0) continue;
      const room = location.capacity[kind] - location.stock[kind];
      const amount = Math.min(regen, room);
      if (amount > 0) {
        delta[kind] = amount;
        any = true;
      }
    }
    if (any) effects.push(effect.locationStock(location.id, delta, 'regen'));
  }

  // ── Beduerfnisse und Ausscheiden ──────────────────────────────────────────
  for (const agent of aliveAgents(state)) {
    const satietyLoss = Math.min(satietyDecayPerRound, agent.needs.satiety);
    const energyGain = Math.min(energyRegenPerRound, 100 - agent.needs.energy);

    if (satietyLoss > 0 || energyGain > 0) {
      effects.push(effect.need(agent.id, { satiety: -satietyLoss, energy: energyGain }));
    }

    const nextSatiety = agent.needs.satiety - satietyLoss;
    const nextEnergy = agent.needs.energy + energyGain;
    const hungerStreak = nextSatiety === 0 ? agent.status.hungerStreak + 1 : 0;
    const exhaustionStreak = nextEnergy === 0 ? agent.status.exhaustionStreak + 1 : 0;

    if (hungerStreak !== agent.status.hungerStreak || exhaustionStreak !== agent.status.exhaustionStreak) {
      effects.push(effect.status(agent.id, { hungerStreak, exhaustionStreak }));
    }

    // Hunger vor Erschoepfung: bei gleichzeitigem Erreichen beider Schwellen
    // braucht die Ursache eine feste Rangfolge, sonst haengt sie an der
    // Auswertungsreihenfolge.
    const cause: EliminationCause | null =
      hungerStreak >= starvationRounds
        ? 'starvation'
        : exhaustionStreak >= exhaustionRounds
          ? 'exhaustion'
          : null;

    if (cause) {
      effects.push(effect.eliminate(agent.id, cause));

      const key = `eliminated_${agent.id}`;
      effects.push(effect.infoItem(eventInfoItem(key, state.round)));
      events.push({
        round: state.round,
        type: 'agent_eliminated',
        actorId: agent.id,
        locationId: agent.location,
        payload: { cause, round: state.round },
        // Dass jemand nicht mehr da ist, faellt allen auf.
        visibility: { scope: 'public' },
        infoRefs: [eventInfoId(key)],
      });
    }
  }

  return { effects, events };
}
