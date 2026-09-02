/**
 * Doc 03 §3.10 — alles, was kalibriert werden muss, an einem Ort.
 *
 * Die Zahlen sind **[ANNAHME]** und Kalibrierungsmasse (T43).
 *
 * `satietyDecayPerRound: 4` ist eine gemessene Entscheidung, keine geratene:
 * bei 30 Agenten und 25 Saettigung je Nahrung entspricht das einem Bedarf von
 * 4,8 Nahrung pro Runde gegen einen Nachschub von 23. Beim frueheren Wert 1
 * war der Bedarf 1,2 — ein 19-facher Ueberschuss, bei dem Agenten mit ueber
 * tausend Nahrung im Beutel endeten. Dort verschwindet jeder Beweggrund, der
 * von Knappheit lebt: niemand zieht weiter, niemand kaempft, niemand stirbt.
 * Die Welt lief, aber es stand nichts mehr auf dem Spiel. Beim Wert 8 kippte
 * es ins andere Extrem: die Agenten verbrachten fast jede Runde mit Ernten und
 * Essen, vernachlaessigten alles andere und verloren ihre Faehigkeiten.
 */

import type { MatchConfig } from './types.js';

export const DEFAULT_ECONOMY = {
  satietyDecayPerRound: 4,
  energyRegenPerRound: 2,
  gatherBase: 3,
  gatherEnergyCost: 10,
  restEnergyGain: 18,
  restSatietyCost: 1,
  foodPerRound: 1,
  satietyPerFood: 25,
  moveEnergyCost: 5,
  starvationRounds: 3,
  exhaustionRounds: 3,
} as const;

/** Doc 03 §3.10: Schwelle 0.80, decayFast 0.05, decaySlow 0.01. */
export const DEFAULT_INFO = {
  assertCertaintyThreshold: 0.8,
  decayFast: 0.05,
  decaySlow: 0.01,
} as const;

/**
 * Entwicklung der Faehigkeiten. **[ANNAHME]**, Kalibrierungsmasse (T43).
 *
 * `startExperience: 500` bei `pointsPerLevel: 10` bedeutet: jeder Agent startet
 * mit 50 in allen drei Faehigkeiten. Das ist der Punkt — alle sind am Anfang
 * gleich stark, und jeder Agent weiss das (`AgentView.world`).
 *
 * Der Verfall ist die Gegenkraft und waechst mit dem Niveau: bei 500 Punkten
 * (Faehigkeit 50) sind es 2 Punkte pro Runde, bei 1000 (Faehigkeit 100) vier.
 * Dadurch stellt sich ein Gleichgewicht ein, das die *Haeufigkeit* einer
 * Taetigkeit abbildet statt nur ihre Existenz: wer 80 % seiner Runden erntet,
 * landet bei Kraft ~80; wer sich auf drei Taetigkeiten verteilt, bei je ~33.
 *
 * Jede Faehigkeit hat genau eine Hauptquelle, und die Quellen konkurrieren um
 * dieselbe knappe Ressource — die Runde:
 *   Ernten  → Kraft        Umziehen → Intuition        Ruhen → Intelligenz
 */
export const DEFAULT_ATTRIBUTES = {
  startExperience: 500,
  pointsPerLevel: 10,
  maxExperience: 1000,
  decayScale: 250,
  decayFloor: 250,
  gatherGain: 4,
  moveGain: 4,
  restGain: 4,
  learnGain: 3,
  fightWinGain: 14,
  fightLossGain: 6,
  maxPersonalityDrift: 1,
} as const;

/** Kampfsystem. **[ANNAHME]**. */
export const DEFAULT_COMBAT = {
  energyCost: 20,
  cooldown: 3,
  killMargin: 0.35,
  lootShare: 0.5,
  damageScale: 60,
} as const;

export const DEFAULT_CONFIG: MatchConfig = {
  agentCount: 30,
  maxRounds: 100,
  survivorThreshold: 1,
  seed: 42,
  llmMode: 'off',
  economy: { ...DEFAULT_ECONOMY },
  info: { ...DEFAULT_INFO },
  attributes: { ...DEFAULT_ATTRIBUTES },
  combat: { ...DEFAULT_COMBAT },
  strictInvariants: true,
};

export interface MatchConfigInput {
  agentCount?: number;
  maxRounds?: number;
  survivorThreshold?: number;
  seed?: number;
  llmMode?: MatchConfig['llmMode'];
  economy?: Partial<MatchConfig['economy']>;
  info?: Partial<MatchConfig['info']>;
  attributes?: Partial<MatchConfig['attributes']>;
  combat?: Partial<MatchConfig['combat']>;
  strictInvariants?: boolean;
}

/**
 * Fuellt Defaults auf und prueft die Grenzen aus Doc 01 §1.3 / Doc 03 §3.10.
 * Eine Config, die durchrutscht und erst 200 Runden spaeter zu einem seltsamen
 * Lauf fuehrt, kostet mehr Zeit als ein Wurf hier.
 */
export function resolveConfig(input: MatchConfigInput = {}): MatchConfig {
  const config: MatchConfig = {
    ...DEFAULT_CONFIG,
    ...stripUndefined(input),
    economy: { ...DEFAULT_ECONOMY, ...stripUndefined(input.economy ?? {}) },
    info: { ...DEFAULT_INFO, ...stripUndefined(input.info ?? {}) },
    attributes: { ...DEFAULT_ATTRIBUTES, ...stripUndefined(input.attributes ?? {}) },
    combat: { ...DEFAULT_COMBAT, ...stripUndefined(input.combat ?? {}) },
  };

  requireInteger('agentCount', config.agentCount, 2, 40);
  requireInteger('maxRounds', config.maxRounds, 1, 5000);
  requireInteger('survivorThreshold', config.survivorThreshold, 0, config.agentCount);
  requireInteger('seed', config.seed, -2_147_483_648, 2_147_483_647);

  for (const [key, value] of Object.entries(config.economy)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`config.economy.${key} muss >= 0 und endlich sein, war ${value}`);
    }
  }

  for (const [key, value] of Object.entries(config.info)) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`config.info.${key} muss in [0, 1] liegen, war ${value}`);
    }
  }

  for (const [key, value] of Object.entries(config.attributes)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError(`config.attributes.${key} muss eine ganze Zahl >= 0 sein, war ${value}`);
    }
  }
  if (config.attributes.pointsPerLevel < 1) {
    throw new RangeError('config.attributes.pointsPerLevel muss >= 1 sein');
  }
  if (config.attributes.startExperience > config.attributes.maxExperience) {
    throw new RangeError('config.attributes.startExperience liegt ueber maxExperience');
  }
  for (const key of ['killMargin', 'lootShare'] as const) {
    if (!Number.isFinite(config.combat[key]) || config.combat[key] < 0 || config.combat[key] > 1) {
      throw new RangeError(`config.combat.${key} muss in [0, 1] liegen, war ${config.combat[key]}`);
    }
  }

  for (const key of ['starvationRounds', 'exhaustionRounds'] as const) {
    if (!Number.isInteger(config.economy[key]) || config.economy[key] < 1) {
      throw new RangeError(`config.economy.${key} muss eine ganze Zahl >= 1 sein, war ${config.economy[key]}`);
    }
  }

  return config;
}

function requireInteger(name: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`config.${name} muss eine ganze Zahl in [${min}, ${max}] sein, war ${value}`);
  }
}

function stripUndefined<T extends object>(input: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(input) as [keyof T, T[keyof T]][]) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}
