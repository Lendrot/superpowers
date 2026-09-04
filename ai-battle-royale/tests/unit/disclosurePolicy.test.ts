/**
 * `statementFor` ist die erste Verteidigungslinie (Doc 08 §8.2.4): was hier
 * entsteht, muss immer schon legal sein, Stufe 7 prueft nur noch nach. Dieser
 * Test nimmt das woertlich und schickt jede Kombination aus Quelle, Sicherheit,
 * geglaubtem Wert und gewuenschter Praezision durch `validateStatement`.
 *
 * Gefundener Fehler (Opus-Review, vor diesem Test): bei `precision:
 * 'existence_only'` UND einem Wert, der Abwesenheit bedeutet (0), UND einer
 * nicht-assertierbaren Quelle (`told_by`, oder verfallene Sicherheit) baute
 * `disclosureAt` `{ mode: 'existence_only' }` — eine Disclosure, die "da ist
 * etwas" behauptet, waehrend der Sprecher "da ist nichts" glaubt. `entails`
 * lehnt das zu Recht ab (R3); die zweite Verteidigungslinie hat es gefangen
 * und auf `express_uncertainty` zurueckfallen lassen, aber das ist bereits ein
 * unnoetiger Fallback fuer eine Aussage, die legal haette sein muessen.
 * Erreichbar im Spiel: `requestInformationAction` fragt gezielt nach dem am
 * wenigsten bekannten Ort, `precisionFor(honesty)` waehlt `existence_only` bei
 * `honesty < 25` — und `outskirts`/`workshop` haben Food-Kapazitaet 0, ihr
 * wahrer Bestand ist also dauerhaft 0.
 */

import { describe, expect, it } from 'vitest';

import { resolveConfig } from '@/engine/core/config.js';
import { ATTRIBUTE_TRACKS, PERSONALITY_TRAITS } from '@/engine/core/types.js';
import type { Agent, AgentId, InfoId, InfoItem, KnowledgeEntry, MatchConfig } from '@/engine/core/types.js';
import { stockInfoId, stockInfoItem } from '@/engine/information/infoRegistry.js';
import { statementFor } from '@/engine/information/disclosurePolicy.js';
import type { Precision } from '@/engine/information/disclosurePolicy.js';
import { validateStatement } from '@/engine/validation/truthValidator.js';
import type { TruthContext } from '@/engine/validation/truthValidator.js';

const config: MatchConfig = resolveConfig();

const SPEAKER: AgentId = 'agent_000';
const TELLER: AgentId = 'agent_001';

const infoId = stockInfoId('warehouse', 'food');
const item: InfoItem = stockInfoItem('warehouse', 'food', 1);
const REGISTRY: Record<InfoId, InfoItem> = { [infoId]: item };

const ROUND = 20;

function speaker(entry: KnowledgeEntry): Agent {
  const experience = {} as Agent['experience'];
  for (const track of ATTRIBUTE_TRACKS) experience[track] = 500;
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
    resources: { food: 5, coins: 10, materials: 1 },
    status: { hungerStreak: 0, exhaustionStreak: 0, exiledFrom: [] },
    knowledge: { [infoId]: entry },
    relationships: {},
    episodic: [],
    lessons: {},
    cooldowns: {},
    allianceId: null,
  };
}

function truthCtx(): TruthContext {
  return { round: ROUND, config, statementLog: {}, infoRegistry: REGISTRY };
}

interface SourceCase {
  label: string;
  entry: Omit<KnowledgeEntry, 'infoId' | 'believedValue'>;
}

const SOURCES: SourceCase[] = [
  {
    label: 'observed, frisch (assertierbar)',
    entry: { certainty: 1, source: 'observed', acquiredRound: ROUND, lastConfirmedRound: ROUND, sharedWith: [], isSecret: false },
  },
  {
    label: 'observed, verfallen (nicht mehr assertierbar)',
    entry: { certainty: 1, source: 'observed', acquiredRound: 1, lastConfirmedRound: 1, sharedWith: [], isSecret: false },
  },
  {
    label: 'told_by (nie assertierbar, R2/R6)',
    entry: {
      certainty: 0.9,
      source: 'told_by',
      sourceAgent: TELLER,
      acquiredRound: ROUND,
      lastConfirmedRound: ROUND,
      sharedWith: [],
      isSecret: false,
    },
  },
  {
    label: 'inferred (nie assertierbar, R6)',
    entry: { certainty: 0.9, source: 'inferred', acquiredRound: ROUND, lastConfirmedRound: ROUND, sharedWith: [], isSecret: false },
  },
];

// 0 = Abwesenheit (der Fehlerfall), 10 = 'some', 25 = 'much' (Schwellen
// stock_at_location: some 1, much 20).
const BELIEVED_VALUES = [0, 10, 25];
const PRECISIONS: Precision[] = ['exact', 'bound', 'qualitative', 'existence_only'];

describe('statementFor — Eigenschaftstest: das Ergebnis besteht immer validateStatement', () => {
  for (const source of SOURCES) {
    for (const believedValue of BELIEVED_VALUES) {
      for (const precision of PRECISIONS) {
        it(`${source.label}, believedValue=${believedValue}, precision=${precision}`, () => {
          const entry: KnowledgeEntry = { infoId, believedValue, ...source.entry };
          const statement = statementFor(entry, item, ROUND, config, precision);
          const verdict = validateStatement(statement, speaker(entry), truthCtx());
          expect(verdict, JSON.stringify({ statement, verdict })).toEqual({ ok: true });
        });
      }
    }
  }
});

describe('der urspruengliche Fehlerfall, isoliert', () => {
  it('waehlt qualitative(none) statt existence_only, wenn told_by UND Abwesenheit', () => {
    const entry: KnowledgeEntry = {
      infoId,
      believedValue: 0,
      certainty: 0.9,
      source: 'told_by',
      sourceAgent: TELLER,
      acquiredRound: ROUND,
      lastConfirmedRound: ROUND,
      sharedWith: [],
      isSecret: false,
    };
    const statement = statementFor(entry, item, ROUND, config, 'existence_only');
    expect(statement).toEqual({
      kind: 'hearsay',
      infoId,
      sourceAgent: TELLER,
      disclosure: { mode: 'qualitative', bucket: 'none' },
    });
  });

  it('existence_only bleibt fuer Anwesenheit unveraendert', () => {
    const entry: KnowledgeEntry = {
      infoId,
      believedValue: 10,
      certainty: 0.9,
      source: 'told_by',
      sourceAgent: TELLER,
      acquiredRound: ROUND,
      lastConfirmedRound: ROUND,
      sharedWith: [],
      isSecret: false,
    };
    const statement = statementFor(entry, item, ROUND, config, 'existence_only');
    expect(statement).toEqual({
      kind: 'hearsay',
      infoId,
      sourceAgent: TELLER,
      disclosure: { mode: 'existence_only' },
    });
  });
});
