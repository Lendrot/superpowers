/**
 * Phase 3 — Kandidatengenerierung.
 *
 * Der Generator darf ausschliesslich Legales anbieten (Doc 05 §5.1, Schritt 1).
 * Doc 08 §8.2.4 nennt das die erste Verteidigungslinie: was hier nicht entsteht,
 * muss der Validator spaeter nicht abfangen. Eine Reject-Rate ueber 2 % ist
 * deshalb ein Bug im Generator, kein Betriebszustand.
 */

import { IMPLEMENTED_ACTIONS } from '../actions/registry.js';
import type { ActionCandidate, ActionContext } from '../actions/types.js';
import type { Agent } from '../core/types.js';

export function generateCandidates(agent: Readonly<Agent>, ctx: ActionContext): ActionCandidate[] {
  const candidates: ActionCandidate[] = [];
  for (const def of IMPLEMENTED_ACTIONS) {
    candidates.push(...def.generate(agent, ctx));
  }
  // Stabile Reihenfolge: die Kandidatenliste ist spaeter der Enum, aus dem das
  // LLM per Index waehlt (Doc 05 §5.4). Waere sie unstabil, waere die Auswahl
  // nicht reproduzierbar.
  return candidates.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}
