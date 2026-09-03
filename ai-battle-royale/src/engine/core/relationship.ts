/**
 * Der neutrale Ausgangspunkt einer `Relationship` — analog zu `emptyResources()`
 * in `resources.ts`. Eigene, kleine Datei statt in `world/relationships.ts`
 * (wo die Delta-Tabelle steht): der `StateMutator` braucht sie, um einen noch
 * unbekannten Partner beim ersten `relationship`-Effekt anzulegen, und darf
 * dafuer nicht von `world/**` abhaengen — dieselbe Richtung, in der auch
 * `resources.ts` und `access.ts` unter `core/` liegen.
 */

import type { Relationship } from './types.js';

export function defaultRelationship(): Relationship {
  return {
    trust: 0,
    friendship: 0,
    respect: 0,
    fear: 0,
    suspicion: 0,
    rivalry: 0,
    attraction: 0,
    debt: 0,
    interactions: 0,
    lastInteractionRound: 0,
    lastEventTypes: [],
  };
}
