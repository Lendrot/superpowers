/**
 * Doc 03 §3.10 — alles, was kalibriert werden muss, an einem Ort.
 *
 * Die Zahlen sind **[ANNAHME]**: sie sind so gewaehlt, dass 100 Runden ohne
 * `consume` und ohne Ausscheiden (beides T08/T16) plausibel durchlaufen. Ob sie
 * eine *interessante* Oekonomie ergeben, ist ungemessen und Aufgabe von T43.
 */

import type { MatchConfig } from './types.js';

export const DEFAULT_ECONOMY = {
  satietyDecayPerRound: 1,
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

export const DEFAULT_CONFIG: MatchConfig = {
  agentCount: 30,
  maxRounds: 100,
  survivorThreshold: 1,
  seed: 42,
  llmMode: 'off',
  economy: { ...DEFAULT_ECONOMY },
  info: { ...DEFAULT_INFO },
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
