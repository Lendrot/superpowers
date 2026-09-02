/**
 * Phase 1 — Upkeep. Vollstaendig deterministisch, kein RNG.
 *
 * Umfang in Schritt 1: Ortsregeneration, Satiety-Verfall, passive
 * Energie-Regeneration, Hunger-/Erschoepfungszaehler.
 *
 * NICHT enthalten: Ausscheiden durch Verhungern oder Erschoepfung. Das ist T08
 * und braucht `consume` (T16), sonst verhungert in Runde N garantiert das ganze
 * Feld — eine Simulation, die nur beweist, dass die Uhr laeuft.
 */

import { aliveAgents, locationIds } from '../core/access.js';
import { RESOURCE_KINDS } from '../core/resources.js';
import type { Effect, WorldState } from '../core/types.js';
import { effect } from '../mutation/effects.js';

export function upkeepEffects(state: Readonly<WorldState>): Effect[] {
  const effects: Effect[] = [];
  const { satietyDecayPerRound, energyRegenPerRound } = state.config.economy;

  // Orte regenerieren, aber nie ueber ihre Kapazitaet. Das Kappen gehoert
  // hierher, nicht in den Mutator: nur wer den Effekt erzeugt, kann ihn so
  // formulieren, dass erwartete und tatsaechliche Aenderung uebereinstimmen.
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
  }

  return effects;
}
