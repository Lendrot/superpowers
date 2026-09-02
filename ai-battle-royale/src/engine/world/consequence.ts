/**
 * Phase 8 — Consequence.
 *
 * Doc 02 §2.3 sieht hier Beziehungsdeltas und Pledge-Aufloesung vor (T19/T21).
 * Beides fehlt noch. Was hier schon steht, gehoert derselben Idee an: die
 * Folgen dessen, was in dieser Runde passiert ist.
 *
 * Zwei Dinge entwickeln sich:
 *
 * 1. **Faehigkeiten.** Wer koerperlich arbeitet, wird staerker; wer ruht und
 *    nachdenkt, klueger; wer umherzieht und ins Leere greift, schaerft sein
 *    Gespuer. Was nicht benutzt wird, bildet sich zurueck — proportional zum
 *    Niveau, bis auf eine Grundkompetenz. Alle Agenten starten gleich; die
 *    Unterschiede am Ende sind gelaufene Wege, keine Wuerfe.
 *
 * 2. **Veranlagung.** Doc 03 §3.2.1 nennt die Persoenlichkeit konstant. Auf
 *    Ansage driftet sie jetzt, aber nur in engen Grenzen: hoechstens ±1 pro
 *    Runde und Achse. Doc 03 §3.2.4 begruendet diese Deckelung fuer die
 *    Strategiegewichte, und die Begruendung gilt hier genauso — ohne Deckel
 *    entstehen oszillierende Agenten, deren Verhalten niemand mehr erklaeren
 *    kann.
 *
 * Alles hier ist deterministisch: es liest die Ereignisse der Runde und rechnet.
 * Kein RNG.
 */

import { aliveAgents, getAgent } from '../core/access.js';
import { ATTRIBUTE_TRACKS } from '../core/types.js';
import type {
  AgentId,
  AttributeConfig,
  AttributeTrack,
  Effect,
  Personality,
  WorldEvent,
  WorldState,
} from '../core/types.js';
import { clampExperienceDelta, emptyExperienceDelta } from '../agents/attributes.js';
import { effect } from '../mutation/effects.js';

export interface ConsequenceResult {
  effects: Effect[];
  /** Wer in dieser Runde einen Attributpunkt gewonnen oder verloren hat. */
  changed: number;
}

/**
 * @param roundEvents Ereignisse **dieser** Runde (Phase 6), nicht der Vorrunde.
 *   Anders als Perception, die eine Runde nachlaeuft, wirken Konsequenzen
 *   sofort: wer gerade gekaempft hat, ist danach staerker.
 * @param newKnowledge Wieviele *neue* Wissenseintraege Phase 2 je Agent
 *   geschrieben hat. Nur Neues macht klueger; dasselbe zum zehnten Mal zu sehen
 *   nicht.
 */
export function consequence(
  state: Readonly<WorldState>,
  roundEvents: readonly WorldEvent[],
  newKnowledge: ReadonlyMap<AgentId, number>,
): ConsequenceResult {
  const config = state.config.attributes;
  const gains = new Map<AgentId, Record<AttributeTrack, number>>();
  const drift = new Map<AgentId, Partial<Personality>>();

  const addGain = (agentId: AgentId, track: AttributeTrack, amount: number): void => {
    const entry = gains.get(agentId) ?? emptyExperienceDelta();
    entry[track] += amount;
    gains.set(agentId, entry);
  };
  const addDrift = (agentId: AgentId, trait: keyof Personality, amount: number): void => {
    const entry = drift.get(agentId) ?? {};
    entry[trait] = (entry[trait] ?? 0) + amount;
    drift.set(agentId, entry);
  };

  // ── Verfall: gilt fuer jeden, in jeder Runde ──────────────────────────────
  // Proportional zum Niveau. Ein fester Betrag haette jede haeufige Taetigkeit
  // ins Maximum getrieben und alle anderen Faehigkeiten auf null.
  for (const agent of aliveAgents(state)) {
    for (const track of ATTRIBUTE_TRACKS) {
      addGain(agent.id, track, -decayFor(agent.experience[track], config));
    }
  }

  // ── Gewinn aus dem, was tatsaechlich getan wurde ──────────────────────────
  for (const event of roundEvents) {
    const actor = event.actorId;
    if (!actor) continue;

    switch (event.type) {
      case 'resource_gathered':
        addGain(actor, 'strength', config.gatherGain);
        break;
      case 'agent_moved':
        addGain(actor, 'intuition', config.moveGain);
        break;
      case 'gather_failed':
        // Wer danebengreift, lernt zu erkennen, wo sich das Hinsehen lohnt.
        addGain(actor, 'intuition', config.gatherFailedGain);
        break;
      case 'agent_rested':
        // Ruhe ist die Taetigkeit, bei der ein Agent nachdenkt.
        addGain(actor, 'intelligence', config.restGain);
        break;
      case 'agent_attacked':
      case 'agent_killed':
        // Die Erfahrung aus dem Kampf selbst vergibt `attack` beim Aufloesen —
        // nur dort ist bekannt, wer gewonnen hat. Hier zaehlt die Wirkung auf
        // den Charakter: wer die Hand erhebt, gewoehnt sich daran.
        addDrift(actor, 'dominance', 1);
        addDrift(actor, 'empathy', -1);
        if (event.targetId) addDrift(event.targetId, 'riskTaking', -1);
        break;
      default:
        break;
    }
  }

  for (const [agentId, count] of newKnowledge) {
    if (count > 0) addGain(agentId, 'intelligence', config.learnGain * Math.min(count, 3));
  }

  // Hunger schaerft den Verstand und macht vorsichtig.
  for (const agent of aliveAgents(state)) {
    if (agent.status.hungerStreak > 0) {
      addDrift(agent.id, 'riskTaking', -1);
    }
  }

  // ── In Effekte uebersetzen, gegen die Grenzen gerechnet ───────────────────
  const effects: Effect[] = [];
  let changed = 0;

  for (const agentId of [...gains.keys()].sort()) {
    const agent = getAgent(state, agentId);
    if (!agent.alive) continue;
    const raw = gains.get(agentId)!;

    const delta: Partial<Record<AttributeTrack, number>> = {};
    let any = false;
    for (const track of ATTRIBUTE_TRACKS) {
      const clamped = clampExperienceDelta(agent.experience[track], raw[track], config);
      if (clamped !== 0) {
        delta[track] = clamped;
        any = true;
      }
    }
    if (any) {
      effects.push(effect.experience(agentId, delta));
      changed += 1;
    }
  }

  for (const agentId of [...drift.keys()].sort()) {
    const agent = getAgent(state, agentId);
    if (!agent.alive) continue;
    const raw = drift.get(agentId)!;

    const delta: Partial<Personality> = {};
    let any = false;
    for (const [trait, amount] of Object.entries(raw) as [keyof Personality, number][]) {
      // Auf das Rundenlimit begrenzen: mehrere Ereignisse in derselben Runde
      // duerfen die Veranlagung nicht schneller verschieben als eines.
      const capped = Math.max(-config.maxPersonalityDrift, Math.min(config.maxPersonalityDrift, amount));
      const current = agent.personality[trait];
      // Am Rand des Wertebereichs waere der Effekt wirkungslos — der Mutator
      // wuerde kappen, und angekuendigte und tatsaechliche Aenderung wichen ab.
      const effective = current + capped < 0 || current + capped > 100 ? 0 : capped;
      if (effective !== 0) {
        delta[trait] = effective;
        any = true;
      }
    }
    if (any) effects.push(effect.personality(agentId, delta));
  }

  return { effects, changed };
}

/** Verfall waechst mit dem Niveau — mindestens 1 Punkt, sonst nichts. */
export function decayFor(points: number, config: Readonly<AttributeConfig>): number {
  if (points <= config.decayFloor) return 0;
  return Math.max(1, Math.round(points / config.decayScale));
}
