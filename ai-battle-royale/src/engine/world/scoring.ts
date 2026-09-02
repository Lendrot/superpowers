/**
 * Phase 11 — Scoring, Leaderboard, Endbedingung.
 *
 * Der Score ist bewusst simpel und **[ANNAHME]**: er misst, was es im Kern zu
 * messen gibt (Ueberleben und Besitz). Einfluss, Reputation und Allianzerfolg
 * kommen mit den Systemen, die sie erzeugen.
 *
 * Auch der Rundenzaehler und das Match-Ende laufen ueber Effects. Sonst gaebe es
 * eine zweite Schreibstelle, und die erste Ausnahme von Regel 1 ist die, nach
 * der die zweite leicht faellt.
 */

import { agentIds, aliveAgents, getAgent } from '../core/access.js';
import type { AgentId, Effect, EndReason, WorldState } from '../core/types.js';
import { effect } from '../mutation/effects.js';

export interface ScoreEntry {
  agentId: AgentId;
  name: string;
  archetype: string;
  alive: boolean;
  score: number;
}

/** Gewichte **[ANNAHME]** — Kalibrierungsmasse (T43). */
const WEIGHTS = { alive: 25, food: 1, coins: 0.5, materials: 0.75, satiety: 0.1, energy: 0.05 } as const;

export function scoreOfAgent(state: Readonly<WorldState>, id: AgentId): number {
  const agent = getAgent(state, id);
  const value =
    (agent.alive ? WEIGHTS.alive : 0) +
    WEIGHTS.food * agent.resources.food +
    WEIGHTS.coins * agent.resources.coins +
    WEIGHTS.materials * agent.resources.materials +
    WEIGHTS.satiety * agent.needs.satiety +
    WEIGHTS.energy * agent.needs.energy;
  // Auf zwei Nachkommastellen gerundet: der Score landet im Event-Log, und
  // lange Gleitkommaschwaenze machen Logs unlesbar, ohne etwas auszusagen.
  return Math.round(value * 100) / 100;
}

export function leaderboard(state: Readonly<WorldState>): ScoreEntry[] {
  return agentIds(state)
    .map((id) => {
      const agent = getAgent(state, id);
      return {
        agentId: id,
        name: agent.name,
        archetype: agent.archetype,
        alive: agent.alive,
        score: scoreOfAgent(state, id),
      };
    })
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.agentId < b.agentId ? -1 : 1));
}

export interface ScoringResult {
  effects: Effect[];
  endReason: EndReason | null;
  aliveCount: number;
}

export function scoringEffects(state: Readonly<WorldState>): ScoringResult {
  const aliveCount = aliveAgents(state).length;
  const endReason = determineEnd(state, aliveCount);

  return {
    effects: endReason ? [effect.matchEnd(endReason)] : [effect.roundAdvance()],
    endReason,
    aliveCount,
  };
}

function determineEnd(state: Readonly<WorldState>, aliveCount: number): EndReason | null {
  if (aliveCount <= state.config.survivorThreshold) return 'survivor_threshold';
  if (state.round >= state.config.maxRounds) return 'round_limit';
  return null;
}
