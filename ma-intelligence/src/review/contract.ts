/**
 * Die harten Grenzen des Review-Loops.
 *
 * Alles hier ist Sicherheitsmechanik, keine Konfiguration. Wer eine dieser
 * Zahlen erhoeht, erhoeht die Anzahl der Runden, die eine KI ohne menschlichen
 * Blick am Code arbeitet — das ist eine Entscheidung fuer `docs/decisions.md`,
 * nicht fuer einen Nebenbei-Commit.
 */

/** Version des Contracts. Aendert sich das Findings-Format, steigt sie. */
export const REVIEW_CONTRACT_VERSION = '1.0.0';

/**
 * Nach drei vollstaendigen Review/Fix-Runden uebernimmt ein Mensch. Der Agent
 * darf danach keine weitere Runde selbst starten.
 */
export const MAX_REVIEW_ROUNDS = 3;

/**
 * Antwortet der Reviewer unbrauchbar (kein JSON, abgeschnitten, falsches
 * Format), darf genau einmal neu angefragt werden. Danach ist der Reviewer
 * selbst das Problem und ein Mensch entscheidet.
 */
export const MAX_REVIEW_ATTEMPTS_PER_ROUND = 2;

/**
 * Findings unterhalb dieser Confidence werden nicht automatisch umgesetzt. Sie
 * verschwinden nicht — sie gehen an die menschliche Triage.
 */
export const MIN_ACTIONABLE_CONFIDENCE = 0.5;

/**
 * Wird ein Finding dieser Schweregrade abgelehnt, entscheidet ein Mensch.
 * Ein Agent, der sein eigenes CRITICAL-Finding wegdiskutieren darf, ist kein
 * Review-Gate.
 */
export const SEVERITIES_REQUIRING_HUMAN_ON_REJECT = ['CRITICAL', 'HIGH'] as const;

export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

export const FINDING_CATEGORIES = [
  'architecture',
  'correctness',
  'data-model',
  'validation',
  'security',
  'testing',
  'maintainability',
  'documentation',
] as const;

export const VERDICT_DECISIONS = ['ACCEPTED', 'REJECTED'] as const;

/** Reihenfolge fuer Sortierung und Anzeige: CRITICAL zuerst. */
export const SEVERITY_ORDER: Readonly<Record<(typeof SEVERITIES)[number], number>> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};
