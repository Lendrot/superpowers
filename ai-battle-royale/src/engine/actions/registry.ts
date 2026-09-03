/**
 * T15 (vorgezogener Teil) — Aktionsregister.
 *
 * CLAUDE.md Regel 7: neue Aktion ⇒ neue Datei in `defs/` + Unit-Test + Eintrag
 * in `resolutionOrder`. Das Register ist bewusst unvollstaendig: `ActionType`
 * kennt alle 13 Aktionen aus Doc 04, implementiert sind in Schritt 1 zwei.
 * Ein Eintrag hier ist die Zusage, dass die Aktion wirklich funktioniert.
 */

import type { ActionType } from '../core/types.js';
import { attackAction } from './defs/attack.js';
import { consumeAction } from './defs/consume.js';
import { gatherResourceAction } from './defs/gatherResource.js';
import { moveAction } from './defs/move.js';
import { requestInformationAction } from './defs/requestInformation.js';
import { restAction } from './defs/rest.js';
import { shareInformationAction } from './defs/shareInformation.js';
import { tradeAction } from './defs/trade.js';
import type { ActionDef } from './types.js';

/** Implementierte Aktionen in stabiler Reihenfolge. */
export const IMPLEMENTED_ACTIONS: readonly ActionDef[] = [
  restAction,
  gatherResourceAction,
  moveAction,
  consumeAction,
  attackAction,
  shareInformationAction,
  requestInformationAction,
  tradeAction,
];

const REGISTRY = new Map<ActionType, ActionDef>(
  IMPLEMENTED_ACTIONS.map((def) => [def.type, def] as const),
);

export function findAction(type: ActionType): ActionDef | undefined {
  return REGISTRY.get(type);
}

export function requireAction(type: ActionType): ActionDef {
  const def = REGISTRY.get(type);
  if (!def) {
    throw new Error(`Aktion ${type} ist deklariert, aber nicht implementiert (actions/registry.ts)`);
  }
  return def;
}

export function isImplemented(type: ActionType): boolean {
  return REGISTRY.has(type);
}
