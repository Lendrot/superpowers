/**
 * Doc 03 §3.9 — sechs benannte Orte als Graph, keine Koordinaten.
 *
 * Der Ort bestimmt spaeter, wer ein Ereignis beobachtet (Phase 2, T11). Fuer den
 * Kern zaehlt zunaechst nur: wo liegt was, und was waechst nach.
 *
 * `coins` regeneriert an keinem Ort. Damit ist die Muenzmenge eines Matches
 * konstant (Doc 03 §3.1) und die Erhaltungspruefung hat einen Fall, in dem sie
 * wirklich etwas beweist.
 */

import type { Location, LocationId } from '../core/types.js';

export const LOCATION_IDS = [
  'commons',
  'fields',
  'outskirts',
  'warehouse',
  'well',
  'workshop',
] as const satisfies readonly LocationId[];

interface LocationDef {
  name: string;
  neighbors: LocationId[];
  stock: { food: number; coins: number; materials: number };
  regenPerRound: { food?: number; coins?: number; materials?: number };
  capacity: { food: number; coins: number; materials: number };
  isPublic: boolean;
}

const LOCATION_DEFS: Record<LocationId, LocationDef> = {
  commons: {
    name: 'Marktplatz',
    neighbors: ['fields', 'warehouse', 'well'],
    stock: { food: 8, coins: 0, materials: 2 },
    regenPerRound: { food: 3 },
    capacity: { food: 30, coins: 0, materials: 10 },
    isPublic: true,
  },
  fields: {
    name: 'Felder',
    neighbors: ['commons', 'well', 'outskirts'],
    stock: { food: 40, coins: 0, materials: 0 },
    regenPerRound: { food: 12 },
    capacity: { food: 100, coins: 0, materials: 0 },
    isPublic: true,
  },
  warehouse: {
    name: 'Lagerhaus',
    neighbors: ['commons', 'workshop'],
    stock: { food: 10, coins: 20, materials: 30 },
    regenPerRound: { food: 2, materials: 4 },
    capacity: { food: 40, coins: 60, materials: 60 },
    isPublic: false,
  },
  workshop: {
    name: 'Werkstatt',
    neighbors: ['warehouse', 'outskirts'],
    stock: { food: 0, coins: 0, materials: 15 },
    regenPerRound: { materials: 6 },
    capacity: { food: 0, coins: 0, materials: 40 },
    isPublic: false,
  },
  well: {
    name: 'Brunnen',
    neighbors: ['commons', 'fields'],
    stock: { food: 12, coins: 0, materials: 0 },
    regenPerRound: { food: 6 },
    capacity: { food: 40, coins: 0, materials: 0 },
    isPublic: true,
  },
  outskirts: {
    name: 'Randbezirk',
    neighbors: ['fields', 'workshop'],
    stock: { food: 0, coins: 0, materials: 6 },
    regenPerRound: { materials: 3 },
    capacity: { food: 0, coins: 0, materials: 20 },
    isPublic: false,
  },
};

/** Frische, unabhaengige Ortsobjekte — der WorldState besitzt sie exklusiv. */
export function createLocations(): Record<LocationId, Location> {
  const out = {} as Record<LocationId, Location>;
  for (const id of LOCATION_IDS) {
    const def = LOCATION_DEFS[id];
    out[id] = {
      id,
      name: def.name,
      neighbors: [...def.neighbors].sort(),
      stock: { ...def.stock },
      regenPerRound: { ...def.regenPerRound },
      capacity: { ...def.capacity },
      isPublic: def.isPublic,
    };
  }
  return out;
}
