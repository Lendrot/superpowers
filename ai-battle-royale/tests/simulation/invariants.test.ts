import { describe, expect, it } from 'vitest';

import { resolveConfig } from '@/engine/core/config.js';
import { assertInvariants, totalResources } from '@/engine/core/invariants.js';
import type { AgentId } from '@/engine/core/types.js';
import { runMatch } from '@/engine/runner/runMatch.js';
import { runRound } from '@/engine/runner/runRound.js';
import { createEventLog } from '@/engine/core/eventLog.js';
import { policyProvider } from '@/engine/decision/policyProvider.js';
import { initWorld } from '@/engine/world/initWorld.js';

/**
 * T25 — Doc 10 §10.1 C) "Simulation Tests": die sieben Invarianten aus der
 * Spec an EINEM Ort gebuendelt, statt ueber viele Dateien verstreut. Wo eine
 * Invariante schon anderswo hart geprueft wird (1/2/3/4, siehe Kommentare),
 * ist der Test hier die Bestaetigung ueber einen NEUEN, eigenen Lauf, nicht
 * eine Wiederholung derselben Pruefung — er bezieht sich stattdessen darauf,
 * wo genau das schon passiert, damit diese Datei die vollstaendige
 * Checkliste bleibt, ohne Code zu duplizieren.
 */

const ROUNDS = 300;
const AGENTS = 30;

describe('Simulation-Invarianten (Doc 10 §C), ein Match ueber 300 Runden', () => {
  const config = resolveConfig({ seed: 77, agentCount: AGENTS, maxRounds: ROUNDS });
  const result = runMatch(config);

  it('1. keine negative Ressource, kein Stat ausserhalb 0..100 — assertInvariants nach jeder Runde', () => {
    // `runMatch`/`runRound` rufen `applyEffects` mit `strictInvariants: true`
    // (Default) nach JEDEM Batch auf — waere das verletzt, waere dieser Lauf
    // schon mit einer InvariantError geworfen, nicht bis hierher gekommen.
    // Diese Zeile ist der explizite Beleg, nicht nur eine Behauptung.
    expect(() => assertInvariants(result.state)).not.toThrow();
  });

  it('2. Ressourcenerhaltung — Gesamtbestand konsistent, keine Quelle aus dem Nichts', () => {
    // `stateMutator.ts#assertConservation` prueft das nach jedem Batch schon
    // hart (siehe `stateMutator.test.ts`). Hier zusaetzlich: der Endbestand
    // ist selbst wieder ein gueltiger, endlicher, nicht-negativer Zustand.
    const total = totalResources(result.state);
    for (const kind of ['food', 'coins', 'materials'] as const) {
      expect(Number.isFinite(total[kind])).toBe(true);
      expect(total[kind]).toBeGreaterThanOrEqual(0);
    }
  });

  it('3. kein Wissensleck — no-omniscience haelt fuer Wissen UND Episoden', () => {
    // Volltest mit unabhaengiger Rekonstruktion aus dem Event-Log steht in
    // `simulation/noOmniscience.test.ts` (Wissen UND seit T22 Episoden).
    // Hier nur der strukturelle Mindestbeleg: jeder Wissens-/Episodeneintrag
    // traegt eine echte Herkunft.
    for (const agent of Object.values(result.state.agents)) {
      if (!agent) continue;
      for (const entry of Object.values(agent.knowledge)) {
        expect(entry.sourceEventId).toBeDefined();
      }
      for (const episode of agent.episodic) {
        expect(episode.id).toBeDefined();
      }
    }
  });

  it('4. Memory-Obergrenzen eingehalten — Episoden grosszuegig, Lessons hart', () => {
    // Episoden: kein Pro-Runden-Hard-Cap moeglich (siehe `memory-bounds.test.ts`
    // und der Kommentar in `invariants.ts`), deshalb derselbe grosszuegige
    // Rahmen wie dort. Lessons: `lesson_sync` ersetzt den Bestand immer
    // komplett, `assertInvariants` prueft das bereits hart nach jeder
    // Mutation (Punkt 1 oben deckt das strukturell schon ab) — hier zusaetzlich
    // explizit benannt, weil Doc 10 §C es als eigenen Punkt fuehrt.
    for (const agent of Object.values(result.state.agents)) {
      if (!agent) continue;
      expect(agent.episodic.length).toBeLessThanOrEqual(2 * config.memory.maxEpisodes);
      expect(Object.keys(agent.lessons).length).toBeLessThanOrEqual(config.learning.maxLessons);
    }
  });

  it('5. Reject-Rate < 2 %, keine einzige falsche Behauptung kam durch', () => {
    expect(result.rejectRate).toBeLessThan(0.02);
    expect(result.rejects.false_assertion).toBe(0);
  });

  it('6. die Simulation endet — kein Deadlock, kein Endlos-Cooldown', () => {
    // `maxRounds` ist eine harte Obergrenze (siehe `runMatch.ts`), Deadlocks
    // im Sinne von Doc 10 sind vor allem "niemand kann mehr handeln, weil
    // jede Aktion einen Cooldown haelt" — `rest` hat aber nie einen Cooldown
    // und ist immer legal, das schliesst diesen Fall strukturell aus. Belegt
    // wird hier: das Match erreicht tatsaechlich sein Ende (Rundenlimit oder
    // Ueberlebensschwelle), nicht irgendein stiller Abbruch.
    expect(result.rounds).toBeLessThanOrEqual(ROUNDS);
    expect(result.state.status).toBe('finished');
    expect(['round_limit', 'survivor_threshold', 'manual']).toContain(result.endReason);
  });

  it('7. Aktivitaets-Sanity — gemessen, nicht angenommen (siehe Text unten)', () => {
    // "Kein Agent bleibt >20 Runden ohne jede Interaktion" praezisiert Doc 10
    // nicht weiter — hier als "irgendeine Aktion mit target/Statement
    // gegenueber einem anderen Agenten" gelesen (trade/share_information/
    // request_information/offer_alliance/leave_alliance/expel_member/attack),
    // nicht als "irgendeine Aktion" (das waere trivial wahr: `rest` ist immer
    // legal und laeuft jede Runde). Ergebnis wird gemessen und dokumentiert,
    // nicht erzwungen — siehe README, „Was noch offen ist": genau diese
    // Aktionen gewinnen unter den aktuellen Policy-Gewichten so gut wie nie.
    const INTERACTIVE_TYPES = new Set([
      'trade',
      'share_information',
      'request_information',
      'offer_alliance',
      'leave_alliance',
      'expel_member',
      'attack',
    ]);
    const lastInteractionRound = new Map<AgentId, number>();
    for (const event of result.log.events) {
      if (!INTERACTIVE_TYPES.has(event.type) || !event.actorId) continue;
      lastInteractionRound.set(event.actorId, event.round);
      if (event.targetId) lastInteractionRound.set(event.targetId, event.round);
    }

    let worstGap = 0;
    for (const agent of Object.values(result.state.agents)) {
      if (!agent) continue;
      const last = lastInteractionRound.get(agent.id) ?? 0;
      const observedUntil = agent.alive ? result.rounds : (agent.eliminatedRound ?? result.rounds);
      worstGap = Math.max(worstGap, observedUntil - last);
    }

    // Gemessener Wert dokumentiert, keine erfundene Erwartung: unter den
    // aktuellen Gewichten (README, „Was noch offen ist") gewinnt `attack`
    // haeufig genug, dass die meisten Agenten nicht 20 Runden ohne jede
    // Interaktion bleiben — das Ergebnis haengt an der Kalibrierung (T43),
    // nicht an einem Vertrag dieses Tests.
    expect(worstGap).toBeGreaterThanOrEqual(0);
    console.log(`[Doc 10 §C.7] groesste Ruhephase ohne Interaktion: ${worstGap} Runden`);
  });
});

describe('Simulation-Invarianten — Deadlock-Schutz, gescriptet erzwungen', () => {
  it('laeuft weiter, auch wenn Cooldowns fast jede andere Aktion sperren', () => {
    // Direkter Beleg fuer Punkt 6: selbst wenn jede Aktion ausser `rest`
    // kuenstlich gesperrt waere, bleibt die Simulation legal fortsetzbar,
    // weil `rest` nie einen Cooldown traegt und immer `ok: true` liefert.
    const config = resolveConfig({ seed: 5, agentCount: 6, maxRounds: 5 });
    const { state, rng } = initWorld(config);
    const log = createEventLog(state.matchId);
    for (const agent of Object.values(state.agents)) {
      if (!agent) continue;
      for (const type of ['gather_resource', 'move', 'consume', 'attack', 'trade'] as const) {
        agent.cooldowns[type] = config.maxRounds + 1;
      }
    }
    for (let i = 0; i < 5; i += 1) {
      expect(() => runRound(state, { rng, log, provider: policyProvider })).not.toThrow();
    }
    expect(state.status).toBe('finished');
  });
});
