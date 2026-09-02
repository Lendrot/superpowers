/**
 * Kleine, reine Helfer fuer Ressourcenbuendel. Bewusst ohne Zustand — sie werden
 * sowohl von Aktionen (die nichts mutieren duerfen) als auch vom StateMutator
 * benutzt.
 */

import type { Resources } from './types.js';

export const RESOURCE_KINDS = ['food', 'coins', 'materials'] as const satisfies readonly (keyof Resources)[];

export function emptyResources(): Resources {
  return { food: 0, coins: 0, materials: 0 };
}

export function addResources(a: Readonly<Resources>, b: Readonly<Partial<Resources>>): Resources {
  return {
    food: a.food + (b.food ?? 0),
    coins: a.coins + (b.coins ?? 0),
    materials: a.materials + (b.materials ?? 0),
  };
}

export function scaleResources(a: Readonly<Resources>, factor: number): Resources {
  return { food: a.food * factor, coins: a.coins * factor, materials: a.materials * factor };
}

export function resourcesEqual(a: Readonly<Resources>, b: Readonly<Resources>): boolean {
  return RESOURCE_KINDS.every((kind) => a[kind] === b[kind]);
}

export function totalOf(a: Readonly<Resources>): number {
  return a.food + a.coins + a.materials;
}
