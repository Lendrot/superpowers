/**
 * Persoenlichkeits-Archetypen.
 *
 * Zweck ist nicht Farbe, sondern Messbarkeit: Erfolgskriterium Doc 01 §1.5.5
 * verlangt, dass kein Archetyp mehr als 40 % der Siege holt. Dafuer braucht die
 * Statistik eine stabile Gruppierung, die nicht aus neun Rohwerten
 * zurueckgerechnet werden muss.
 *
 * Die Mittelwerte sind **[ANNAHME]** und Kalibrierungsmasse (T43).
 */

import type { ArchetypeId, Personality } from '../core/types.js';

export interface ArchetypeDef {
  id: ArchetypeId;
  label: string;
  means: Personality;
}

const BASE: Personality = {
  ambition: 50,
  loyalty: 50,
  honesty: 50,
  empathy: 50,
  riskTaking: 50,
  intelligence: 50,
  sociability: 50,
  manipulation: 50,
  dominance: 50,
};

export const ARCHETYPES: readonly ArchetypeDef[] = [
  {
    id: 'striver',
    label: 'Aufsteiger',
    means: { ...BASE, ambition: 80, dominance: 70, riskTaking: 62, empathy: 35, loyalty: 40 },
  },
  {
    id: 'loyalist',
    label: 'Getreuer',
    means: { ...BASE, loyalty: 82, honesty: 75, empathy: 68, manipulation: 25, riskTaking: 35 },
  },
  {
    id: 'opportunist',
    label: 'Opportunist',
    means: { ...BASE, manipulation: 78, riskTaking: 72, loyalty: 28, honesty: 32, ambition: 65 },
  },
  {
    id: 'recluse',
    label: 'Einzelgaenger',
    means: { ...BASE, sociability: 22, intelligence: 68, loyalty: 45, dominance: 38, empathy: 40 },
  },
  {
    id: 'connector',
    label: 'Vermittler',
    means: { ...BASE, sociability: 82, empathy: 74, honesty: 62, intelligence: 60, dominance: 45 },
  },
];

export const ARCHETYPE_IDS = ARCHETYPES.map((a) => a.id);

export function archetypeById(id: ArchetypeId): ArchetypeDef {
  const found = ARCHETYPES.find((entry) => entry.id === id);
  if (!found) {
    throw new Error(`Unbekannter Archetyp: ${id}`);
  }
  return found;
}
