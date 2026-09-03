import { beforeEach, describe, expect, it } from 'vitest';

import { buildAgentView } from '@/engine/agents/agentView.js';
import { resolveConfig } from '@/engine/core/config.js';
import { canonicalJson } from '@/engine/core/hash.js';
import type { AgentId, WorldState } from '@/engine/core/types.js';
import { stockInfoId } from '@/engine/information/infoRegistry.js';
import { applyEffects } from '@/engine/mutation/stateMutator.js';
import { effect } from '@/engine/mutation/effects.js';
import { observedEntry } from '@/engine/information/knowledge.js';
import { initWorld } from '@/engine/world/initWorld.js';

/**
 * Gate aus Doc 12, Tag 2 — `agent-view-isolation`.
 *
 * Doc 05 §5.1 verlangt einen Serialisierungs-Diff-Test: die `AgentView` darf
 * keinen Pfad zu Fremdwissen enthalten. Statt Feld fuer Feld aufzuzaehlen —
 * was jedes neue Feld stillschweigend durchliesse — werden hier eindeutige
 * Sentinel-Werte in den WorldState gepflanzt und in der Serialisierung gesucht.
 * Was ein Agent nicht wissen darf, darf auch nicht als Zahl in seiner Sicht
 * auftauchen.
 */

const SELF: AgentId = 'agent_000';
const OTHER_HERE: AgentId = 'agent_001';
const OTHER_ELSEWHERE: AgentId = 'agent_002';

// Werte, die sonst nirgends vorkommen — jeder Treffer ist ein Leck.
const SENTINEL_FOREIGN_COINS = 917_331;
const SENTINEL_FOREIGN_FOOD = 917_332;
const SENTINEL_REMOTE_STOCK = 917_333;
const SENTINEL_FOREIGN_BELIEF = 917_334;
const SENTINEL_FOREIGN_DEBT = 917_335;
const SENTINEL_OWN_DEBT = 917_336;

let state: WorldState;

beforeEach(() => {
  state = initWorld(resolveConfig({ seed: 12, agentCount: 5 })).state;

  state.agents[SELF]!.location = 'commons';
  state.agents[OTHER_HERE]!.location = 'commons';
  state.agents[OTHER_ELSEWHERE]!.location = 'outskirts';

  // Fremde Vorraete und Beduerfnisse.
  state.agents[OTHER_HERE]!.resources.coins = SENTINEL_FOREIGN_COINS;
  state.agents[OTHER_ELSEWHERE]!.resources.food = SENTINEL_FOREIGN_FOOD;

  // Ein Bestand an einem Ort, an dem der Agent nicht steht.
  state.locations['warehouse']!.capacity.materials = SENTINEL_REMOTE_STOCK;
  state.locations['warehouse']!.stock.materials = SENTINEL_REMOTE_STOCK;

  // Fremdes Wissen.
  applyEffects(state, [
    effect.knowledge(
      OTHER_HERE,
      observedEntry({
        infoId: stockInfoId('warehouse', 'materials'),
        believedValue: SENTINEL_FOREIGN_BELIEF,
        round: 1,
        source: 'observed',
        sourceEventId: 'event_0001_00000',
      }),
    ),
    // OTHER_HEREs Sicht auf einen DRITTEN — das ist OTHER_HEREs eigene
    // Beziehung, nicht SELFs. Und SELFs eigene Sicht auf OTHER_HERE, die
    // durchaus in der View stehen darf.
    effect.relationship(OTHER_HERE, OTHER_ELSEWHERE, { debt: SENTINEL_FOREIGN_DEBT }, 'trade_accepted'),
    effect.relationship(SELF, OTHER_HERE, { debt: SENTINEL_OWN_DEBT }, 'trade_accepted'),
  ]);
});

describe('AgentView — Isolation', () => {
  it('enthaelt keine fremden Vorraete', () => {
    const serialized = canonicalJson(buildAgentView(state, SELF));
    expect(serialized).not.toContain(String(SENTINEL_FOREIGN_COINS));
    expect(serialized).not.toContain(String(SENTINEL_FOREIGN_FOOD));
  });

  it('enthaelt keinen Bestand von Orten, an denen der Agent nicht steht', () => {
    const serialized = canonicalJson(buildAgentView(state, SELF));
    expect(serialized).not.toContain(String(SENTINEL_REMOTE_STOCK));
  });

  it('enthaelt kein fremdes Wissen', () => {
    const serialized = canonicalJson(buildAgentView(state, SELF));
    expect(serialized).not.toContain(String(SENTINEL_FOREIGN_BELIEF));
  });

  it('enthaelt keine fremde Beziehung — nur die eigene, gerichtete Sicht', () => {
    // OTHER_HEREs Beziehung zu OTHER_ELSEWHERE ist Fremdwissen; SELFs eigene
    // Beziehung zu OTHER_HERE ist es nicht und muss ankommen.
    const serialized = canonicalJson(buildAgentView(state, SELF));
    expect(serialized).not.toContain(String(SENTINEL_FOREIGN_DEBT));
    expect(serialized).toContain(String(SENTINEL_OWN_DEBT));
  });

  it('enthaelt das infoRegistry nicht', () => {
    const view = buildAgentView(state, SELF);
    expect(view).not.toHaveProperty('infoRegistry');
    expect(canonicalJson(view)).not.toContain('infoRegistry');
  });

  it('enthaelt von anderen Agenten nur Name, Id und eine Krafteinschaetzung', () => {
    const view = buildAgentView(state, SELF);
    for (const other of view.coLocated) {
      expect(Object.keys(other).sort()).toEqual([
        'believedStrength',
        'id',
        'name',
        'relationship',
        'strengthCertainty',
      ]);
    }
  });

  it('schaetzt fremde Kraft auf den Startwert, solange nichts beobachtet wurde', () => {
    // "Alle starten gleich stark" ist Weltwissen, keine Beobachtung an einer
    // Person — deshalb darf es hier stehen, ohne die Epistemik zu verletzen.
    const view = buildAgentView(state, SELF);
    for (const other of view.coLocated) {
      expect(other.believedStrength).toBe(view.world.startingAttribute);
      expect(other.strengthCertainty).toBe(0);
    }
  });

  it('nennt nur Anwesende, und den Agenten selbst nicht', () => {
    const view = buildAgentView(state, SELF);
    expect(view.coLocated.map((a) => a.id)).toEqual([OTHER_HERE]);
  });

  it('reicht den WorldState nicht als Referenz durch', () => {
    const view = buildAgentView(state, SELF);
    // Kopien, keine geteilten Objekte: wer die Sicht veraendert, veraendert
    // nicht die Welt.
    view.self.resources.coins = 4;
    view.here.stock.food = 4;
    expect(state.agents[SELF]!.resources.coins).not.toBe(4);
    expect(state.locations['commons']!.stock.food).not.toBe(4);
  });
});

describe('AgentView — was drin sein MUSS', () => {
  it('zeigt den Agenten sich selbst vollstaendig', () => {
    const view = buildAgentView(state, SELF);
    const self = state.agents[SELF]!;
    expect(view.self.resources).toEqual(self.resources);
    expect(view.self.needs).toEqual(self.needs);
    expect(view.self.personality).toEqual(self.personality);
  });

  it('zeigt den eigenen Ort mit Bestand und Nachbarn', () => {
    const view = buildAgentView(state, SELF);
    expect(view.here.id).toBe('commons');
    expect(view.here.stock).toEqual(state.locations['commons']!.stock);
    expect(view.here.neighbors).toEqual(state.locations['commons']!.neighbors);
  });

  it('zeigt eigene Ueberzeugungen mit der heute geltenden Sicherheit', () => {
    applyEffects(state, [
      effect.knowledge(
        SELF,
        observedEntry({
          infoId: stockInfoId('fields', 'food'),
          believedValue: 40,
          round: 1,
          source: 'observed',
          sourceEventId: 'event_0001_00000',
        }),
      ),
      effect.roundAdvance(),
      effect.roundAdvance(),
    ]);

    const belief = buildAgentView(state, SELF).beliefs[stockInfoId('fields', 'food')];
    expect(belief?.entry.believedValue).toBe(40);
    // Runde 3, bestaetigt in Runde 1, Verfall 0.05 pro Runde: 1 − 2·0.05.
    expect(belief?.certainty).toBeCloseTo(0.9);
    expect(belief?.assertable).toBe(true);
  });

  it('markiert veraltete Ueberzeugungen als nicht mehr behauptbar', () => {
    applyEffects(state, [
      effect.knowledge(
        SELF,
        observedEntry({
          infoId: stockInfoId('fields', 'food'),
          believedValue: 40,
          round: 1,
          source: 'observed',
          sourceEventId: 'event_0001_00000',
        }),
      ),
    ]);
    for (let i = 0; i < 6; i += 1) applyEffects(state, [effect.roundAdvance()]);

    const belief = buildAgentView(state, SELF).beliefs[stockInfoId('fields', 'food')];
    expect(belief?.assertable).toBe(false);
    // Der Glaube bleibt — nur die Sicherheit ist weg. Irrtum ist keine Luege.
    expect(belief?.entry.believedValue).toBe(40);
  });
});
