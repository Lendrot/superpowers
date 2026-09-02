/**
 * Bestandsreservierung innerhalb einer Runde.
 *
 * Phase 6 loest alle Aktionen auf, bevor Phase 7 irgendetwas schreibt. Ohne
 * Ledger wuerden zwei Ernten am selben Ort beide den vollen Bestand sehen und
 * der Batch wuerde den Ort ins Minus druecken — der StateMutator wuerde werfen,
 * und zwar zu Recht.
 */

import type { LocationId, ResourceKind, WorldState } from '../core/types.js';

export interface StockLedger {
  /** Noch frei verfuegbarer Bestand nach allen bisherigen Reservierungen. */
  available(locationId: LocationId, kind: ResourceKind): number;
  /** Reserviert `amount`; wirft, wenn mehr verlangt wird als verfuegbar ist. */
  reserve(locationId: LocationId, kind: ResourceKind, amount: number): void;
}

export function createStockLedger(state: Readonly<WorldState>): StockLedger {
  const reserved = new Map<string, number>();
  const key = (locationId: LocationId, kind: ResourceKind): string => `${locationId}:${kind}`;

  return {
    available(locationId, kind) {
      const location = state.locations[locationId];
      if (!location) throw new Error(`Unbekannter Ort: ${locationId}`);
      return location.stock[kind] - (reserved.get(key(locationId, kind)) ?? 0);
    },
    reserve(locationId, kind, amount) {
      if (amount < 0) throw new RangeError(`reserve: negative Menge (${amount})`);
      const free = this.available(locationId, kind);
      if (amount > free) {
        throw new RangeError(`reserve: ${amount} ${kind} an ${locationId}, verfuegbar sind ${free}`);
      }
      reserved.set(key(locationId, kind), (reserved.get(key(locationId, kind)) ?? 0) + amount);
    },
  };
}
