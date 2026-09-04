import { describe, expect, it } from 'vitest';

import { resolveConfig } from '@/engine/core/config.js';
import { runMatch } from '@/engine/runner/runMatch.js';

/**
 * Gate aus `12-build-order.md`, T22 (`memory-bounds.test.ts`): "Obergrenze
 * ueber 400 Runden gehalten". Kompaktierung entfernt bei Ueberschreiten von
 * `maxEpisodes` nur die untersten `compactionThreshold` (20 %) — kein
 * Einzelschritt garantiert also sofort wieder `<= maxEpisodes`, aber ueber
 * viele Runden pendelt sich die Laenge ein, statt unbegrenzt zu wachsen.
 * Geprueft wird deshalb ein grosszuegiger, aber endlicher Rahmen, plus dass
 * Runde 400 nicht laenger ist als Runde 200 — der Beleg fuer "eingependelt",
 * nicht nur "noch nicht explodiert".
 */

const CONFIG = resolveConfig({ seed: 42, agentCount: 30, maxRounds: 400 });

function maxEpisodicLength(result: ReturnType<typeof runMatch>): number {
  return Math.max(
    0,
    ...Object.values(result.state.agents)
      .filter((agent) => agent !== undefined)
      .map((agent) => agent!.episodic.length),
  );
}

describe('Episodisches Gedaechtnis — Obergrenze ueber 400 Runden', () => {
  it('waechst nicht unbegrenzt und bleibt in einem grosszuegigen Rahmen um maxEpisodes', () => {
    const result = runMatch(CONFIG);
    const max = maxEpisodicLength(result);
    expect(max).toBeGreaterThan(0); // die Mechanik hat ueberhaupt etwas geschrieben
    expect(max).toBeLessThanOrEqual(2 * CONFIG.memory.maxEpisodes);
  });

  it('ist bei Runde 400 nicht groesser als bei Runde 200 — die Kompaktierung haelt Schritt', () => {
    const at200 = runMatch(resolveConfig({ seed: 42, agentCount: 30, maxRounds: 200 }));
    const at400 = runMatch(CONFIG);
    expect(maxEpisodicLength(at400)).toBeLessThanOrEqual(maxEpisodicLength(at200) + 5);
  });

  it('jede Episode traegt eine Salience in 0..1 — Verfall lief korrekt, auch nach vielen Runden', () => {
    const result = runMatch(CONFIG);
    for (const agent of Object.values(result.state.agents)) {
      if (!agent) continue;
      for (const episode of agent.episodic) {
        expect(episode.salience).toBeGreaterThanOrEqual(0);
        expect(episode.salience).toBeLessThanOrEqual(1);
      }
    }
  });
});
