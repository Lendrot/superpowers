/**
 * Der wichtigste Test des Projekts (Doc 09 §9.5): die Tabelle aus Doc 08 §8.3,
 * vollstaendig.
 *
 * Zwei Anpassungen an der Tabelle, beide notwendig und beide dokumentiert:
 *
 * 1. Die Tabelle spricht von `tools`. Diese Ressource gibt es nicht mehr — Doc 03
 *    §3.2.2 hat sie in `materials` aufgehen lassen. Gemeint ist der Fall "der
 *    Agent kennt den Bestand einer zweiten Ressource am selben Ort"; dafuer
 *    steht hier `materials`.
 * 2. Die beiden R7-Zeilen laufen ueber `coins`, nicht ueber einen Ortsbestand.
 *    Das ist keine Willkuer, sondern das Einzige, was die Zeile "Wissen hat sich
 *    auf 2 geaendert → heute `none` ✅" ueberhaupt widerspruchsfrei macht: bei
 *    den Muenzgrenzen aus §8.2.2 (`none: 0–5`) ist 2 tatsaechlich `none`, bei
 *    einem Ortsbestand (`some` ab 1) waere es `some`, und die Aussage waere
 *    schon an R3 gescheitert. Die Zeile meint Muenzen.
 */

import { describe, expect, it } from 'vitest';

import { resolveConfig } from '@/engine/core/config.js';
import { ATTRIBUTE_TRACKS, PERSONALITY_TRAITS } from '@/engine/core/types.js';
import type {
  Agent,
  AgentId,
  InfoId,
  InfoItem,
  KnowledgeEntry,
  MatchConfig,
  Statement,
  StatementLog,
  StatementRecord,
} from '@/engine/core/types.js';
import {
  agentResourceInfoId,
  agentResourceInfoItem,
  stockInfoId,
  stockInfoItem,
} from '@/engine/information/infoRegistry.js';
import { validateStatement } from '@/engine/validation/truthValidator.js';
import type { TruthContext } from '@/engine/validation/truthValidator.js';

const config: MatchConfig = resolveConfig();

const SPEAKER = 'agent_000' as AgentId;
const JONAS = 'agent_001' as AgentId;
const MAYA = 'agent_002' as AgentId;

const warehouseFood = stockInfoId('warehouse', 'food');
const warehouseMaterials = stockInfoId('warehouse', 'materials');
const ownCoins = agentResourceInfoId(SPEAKER, 'coins');

const REGISTRY: Record<InfoId, InfoItem> = {
  [warehouseFood]: stockInfoItem('warehouse', 'food', 1),
  [warehouseMaterials]: stockInfoItem('warehouse', 'materials', 1),
  [ownCoins]: agentResourceInfoItem(SPEAKER, 'coins', 1),
};

const ROUND = 10;

function knows(patch: Partial<KnowledgeEntry> & { infoId: InfoId }): KnowledgeEntry {
  return {
    believedValue: 20,
    certainty: 1,
    source: 'observed',
    acquiredRound: ROUND,
    lastConfirmedRound: ROUND,
    sharedWith: [],
    isSecret: false,
    ...patch,
  };
}

function speaker(...entries: KnowledgeEntry[]): Agent {
  const knowledge: Record<InfoId, KnowledgeEntry> = {};
  for (const entry of entries) knowledge[entry.infoId] = entry;

  const experience = {} as Agent['experience'];
  for (const track of ATTRIBUTE_TRACKS) experience[track] = 500;

  // Die Persoenlichkeit spielt fuer den Truth-Validator keine Rolle: wer luegen
  // WILL, darf es trotzdem nicht. Deshalb hier durchweg die Mitte.
  const personality = {} as Agent['personality'];
  for (const trait of PERSONALITY_TRAITS) personality[trait] = 50;

  return {
    id: SPEAKER,
    name: 'Test',
    archetype: 'striver',
    alive: true,
    location: 'warehouse',
    personality,
    experience,
    kills: 0,
    needs: { satiety: 80, energy: 80 },
    resources: { food: 5, coins: 100, materials: 1 },
    status: { hungerStreak: 0, exhaustionStreak: 0, exiledFrom: [] },
    knowledge,
    relationships: {},
    episodic: [],
    lessons: {},
    cooldowns: {},
    allianceId: null,
  };
}

function ctx(statementLog: StatementLog = {}): TruthContext {
  return { round: ROUND, config, statementLog, infoRegistry: REGISTRY };
}

/** Der Wissensstand aus den ersten Zeilen der Tabelle. */
const warehouseKnowledge = [
  knows({ infoId: warehouseFood, believedValue: 20, certainty: 0.95 }),
  knows({ infoId: warehouseMaterials, believedValue: 5, certainty: 0.95 }),
];

describe('Doc 08 §8.3 — Testtabelle des Truth-Validators', () => {
  it('Warehouse food=20 (observed, 0.95): assert_fact existence_only ⇒ accept', () => {
    const result = validateStatement(
      { kind: 'assert_fact', infoId: warehouseFood, disclosure: { mode: 'existence_only' } },
      speaker(...warehouseKnowledge),
      ctx(),
    );
    expect(result).toEqual({ ok: true });
  });

  it("dito: assert_fact qualitative:'much' ⇒ accept", () => {
    const result = validateStatement(
      { kind: 'assert_fact', infoId: warehouseFood, disclosure: { mode: 'qualitative', bucket: 'much' } },
      speaker(...warehouseKnowledge),
      ctx(),
    );
    expect(result).toEqual({ ok: true });
  });

  it('dito: refuse_to_answer(stock_at_location) ⇒ accept', () => {
    const result = validateStatement(
      { kind: 'refuse_to_answer', topic: 'stock_at_location' },
      speaker(...warehouseKnowledge),
      ctx(),
    );
    expect(result).toEqual({ ok: true });
  });

  it('dito: assert_absence(materials) bei materials=5 ⇒ false_assertion', () => {
    const result = validateStatement(
      { kind: 'assert_absence', infoId: warehouseMaterials },
      speaker(...warehouseKnowledge),
      ctx(),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('false_assertion');
  });

  it('dito: assert_fact(food, exact 5) bei geglaubten 20 ⇒ false_assertion', () => {
    const result = validateStatement(
      { kind: 'assert_fact', infoId: warehouseFood, disclosure: { mode: 'exact', value: 5 } },
      speaker(...warehouseKnowledge),
      ctx(),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('false_assertion');
  });

  it('keine Kenntnis ueber materials: assert_absence(materials) ⇒ unknown_reference', () => {
    const result = validateStatement(
      { kind: 'assert_absence', infoId: warehouseMaterials },
      speaker(knows({ infoId: warehouseFood })),
      ctx(),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('unknown_reference');
  });

  it('coins=100 (eigene, 1.0): assert_fact existence_only ⇒ accept', () => {
    const result = validateStatement(
      { kind: 'assert_fact', infoId: ownCoins, disclosure: { mode: 'existence_only' } },
      speaker(knows({ infoId: ownCoins, believedValue: 100 })),
      ctx(),
    );
    expect(result).toEqual({ ok: true });
  });

  it("coins=100: assert_fact qualitative:'none' ⇒ false_assertion", () => {
    const result = validateStatement(
      { kind: 'assert_fact', infoId: ownCoins, disclosure: { mode: 'qualitative', bucket: 'none' } },
      speaker(knows({ infoId: ownCoins, believedValue: 100 })),
      ctx(),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('false_assertion');
  });

  it('coins=100: refuse_to_answer(agent_resource) ⇒ accept', () => {
    const result = validateStatement(
      { kind: 'refuse_to_answer', topic: 'agent_resource' },
      speaker(knows({ infoId: ownCoins, believedValue: 100 })),
      ctx(),
    );
    expect(result).toEqual({ ok: true });
  });

  // ── Hoerensagen von Jonas (told_by, 0.5) ──────────────────────────────────
  const fromJonas = knows({
    infoId: warehouseFood,
    believedValue: 20,
    certainty: 0.5,
    source: 'told_by',
    sourceAgent: JONAS,
  });

  it('von Jonas gehoert: assert_fact ⇒ unsupported_certainty', () => {
    const result = validateStatement(
      { kind: 'assert_fact', infoId: warehouseFood, disclosure: { mode: 'qualitative', bucket: 'much' } },
      speaker(fromJonas),
      ctx(),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('unsupported_certainty');
  });

  it('dito: hearsay mit sourceAgent Jonas ⇒ accept', () => {
    const result = validateStatement(
      {
        kind: 'hearsay',
        infoId: warehouseFood,
        sourceAgent: JONAS,
        disclosure: { mode: 'qualitative', bucket: 'much' },
      },
      speaker(fromJonas),
      ctx(),
    );
    expect(result).toEqual({ ok: true });
  });

  it('dito: hearsay mit sourceAgent Maya ⇒ unattributed_hearsay', () => {
    const result = validateStatement(
      {
        kind: 'hearsay',
        infoId: warehouseFood,
        sourceAgent: MAYA,
        disclosure: { mode: 'qualitative', bucket: 'much' },
      },
      speaker(fromJonas),
      ctx(),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('unattributed_hearsay');
  });

  it("dito: belief mit hedge 'not_sure' ⇒ accept", () => {
    const result = validateStatement(
      {
        kind: 'belief',
        infoId: warehouseFood,
        hedge: 'not_sure',
        disclosure: { mode: 'qualitative', bucket: 'much' },
      },
      speaker(fromJonas),
      ctx(),
    );
    expect(result).toEqual({ ok: true });
  });

  it('veralteter Glaube (Welt 0, geglaubt 20, 0.85, observed) ⇒ accept — Irrtum, keine Luege', () => {
    // Der Validator sieht die Weltwahrheit gar nicht. Genau das ist §8.2.1:
    // die Welt mag den Bestand laengst geleert haben, der Agent weiss es nicht.
    const result = validateStatement(
      { kind: 'assert_fact', infoId: warehouseFood, disclosure: { mode: 'qualitative', bucket: 'much' } },
      speaker(knows({ infoId: warehouseFood, believedValue: 20, certainty: 0.85 })),
      ctx(),
    );
    expect(result).toEqual({ ok: true });
  });

  it('inferred mit 0.9: assert_fact ⇒ unsupported_certainty (R6)', () => {
    const result = validateStatement(
      { kind: 'assert_fact', infoId: warehouseFood, disclosure: { mode: 'qualitative', bucket: 'much' } },
      speaker(knows({ infoId: warehouseFood, certainty: 0.9, source: 'inferred' })),
      ctx(),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('unsupported_certainty');
  });

  // ── R7 ────────────────────────────────────────────────────────────────────
  function saidYesterday(believedValueAtTime: number): StatementLog {
    const record: StatementRecord = {
      infoId: ownCoins,
      kind: 'assert_fact',
      disclosure: { mode: 'qualitative', bucket: 'much' },
      believedValueAtTime,
      round: ROUND - 1,
    };
    return { [SPEAKER]: { [ownCoins]: record } };
  }

  const todayNone: Statement = {
    kind: 'assert_fact',
    infoId: ownCoins,
    disclosure: { mode: 'qualitative', bucket: 'none' },
  };

  it("sagte gestern 'much', Wissen unveraendert, heute 'none' ⇒ self_contradiction", () => {
    const result = validateStatement(
      todayNone,
      speaker(knows({ infoId: ownCoins, believedValue: 100 })),
      ctx(saidYesterday(100)),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('self_contradiction');
  });

  it("sagte gestern 'much', Wissen ist auf 2 gefallen, heute 'none' ⇒ accept", () => {
    const result = validateStatement(
      todayNone,
      speaker(knows({ infoId: ownCoins, believedValue: 2 })),
      ctx(saidYesterday(100)),
    );
    expect(result).toEqual({ ok: true });
  });
});

describe('Reihenfolge und Vorschlaege', () => {
  it('R7 schlaegt R3: der Selbstwiderspruch ist die genauere Diagnose', () => {
    // Bei geglaubten 100 Muenzen ist "keine" auch nach R3 falsch. Die Tabelle
    // erwartet trotzdem `self_contradiction` — deshalb steht R7 davor.
    const withoutHistory = validateStatement(
      { kind: 'assert_fact', infoId: ownCoins, disclosure: { mode: 'qualitative', bucket: 'none' } },
      speaker(knows({ infoId: ownCoins, believedValue: 100 })),
      ctx(),
    );
    expect(withoutHistory.ok === false && withoutHistory.reason).toBe('false_assertion');
  });

  it('unsupported_certainty schlaegt hearsay als Ausweg vor, nicht blosses Schweigen', () => {
    const result = validateStatement(
      { kind: 'assert_fact', infoId: warehouseFood, disclosure: { mode: 'qualitative', bucket: 'much' } },
      speaker(
        knows({
          infoId: warehouseFood,
          certainty: 0.5,
          source: 'told_by',
          sourceAgent: JONAS,
        }),
      ),
      ctx(),
    );
    expect(result.ok === false && result.suggestion).toEqual({
      kind: 'hearsay',
      infoId: warehouseFood,
      sourceAgent: JONAS,
      disclosure: { mode: 'qualitative', bucket: 'much' },
    });
  });

  it('bei falscher Behauptung bleibt nur der Rueckzug auf express_uncertainty', () => {
    const result = validateStatement(
      { kind: 'assert_fact', infoId: warehouseFood, disclosure: { mode: 'exact', value: 5 } },
      speaker(knows({ infoId: warehouseFood, believedValue: 20 })),
      ctx(),
    );
    // `belief(exact 5)` waere weiterhin falsch — ein Vorschlag, der selbst
    // abgelehnt wuerde, waere schlimmer als keiner.
    expect(result.ok === false && result.suggestion).toEqual({
      kind: 'express_uncertainty',
      topic: 'stock_at_location',
    });
  });

  it('ohne Wissen gibt es keinen Vorschlag, der etwas behauptet', () => {
    const result = validateStatement(
      { kind: 'assert_absence', infoId: warehouseMaterials },
      speaker(knows({ infoId: warehouseFood })),
      ctx(),
    );
    expect(result.ok === false && result.suggestion).toEqual({
      kind: 'express_uncertainty',
      topic: 'stock_at_location',
    });
  });

  it('R9: alle vier Verweigerungsformen sind ohne jedes Wissen zulaessig', () => {
    const ignorant = speaker();
    const refusals: Statement[] = [
      { kind: 'refuse_to_answer', topic: 'agent_resource' },
      { kind: 'withhold', topic: 'agent_resource' },
      { kind: 'redirect_conversation', toTopic: 'stock_at_location' },
      { kind: 'express_uncertainty', topic: 'agent_resource' },
      { kind: 'none' },
    ];
    for (const statement of refusals) {
      expect(validateStatement(statement, ignorant, ctx())).toEqual({ ok: true });
    }
  });

  it('R8: declare_intent unterliegt R1–R7 nicht', () => {
    const result = validateStatement(
      { kind: 'declare_intent', intent: 'ich teile morgen meine Nahrung' },
      speaker(),
      ctx(),
    );
    expect(result).toEqual({ ok: true });
  });

  it('Sicherheitsverfall wirkt auch hier: gestern beobachtet reicht, vor 10 Runden nicht', () => {
    // stock_at_location ist 'fast' (0.05/Runde): 1.0 − 10 × 0.05 = 0.5 < 0.8.
    const stale = speaker(
      knows({ infoId: warehouseFood, certainty: 1, lastConfirmedRound: ROUND - 10 }),
    );
    const result = validateStatement(
      { kind: 'assert_fact', infoId: warehouseFood, disclosure: { mode: 'existence_only' } },
      stale,
      ctx(),
    );
    expect(result.ok === false && result.reason).toBe('unsupported_certainty');
  });
});
