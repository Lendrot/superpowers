import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { actionTypeSchema } from '@/engine/core/schemas.js';

/**
 * Doc 04 §4.2 und Doc 08 §8.4 — `no-lie-actions`.
 *
 * Die Truthfulness-Regel ist der Kern des Projekts. Die vier verbotenen
 * Aktionen duerfen nicht als Absicht dokumentiert, sondern muessen als
 * Nichtexistenz im Code nachweisbar sein.
 *
 * Der Test prueft nur `src/` — dieser Testfile nennt die Namen selbst.
 */

const SRC = fileURLToPath(new URL('../../src', import.meta.url));

const FORBIDDEN = ['lie', 'fabricate_information', 'invent_evidence', 'knowingly_spread_false_rumor'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });
}

describe('verbotene Aktionen existieren nicht', () => {
  const files = walk(SRC);

  it('findet ueberhaupt Quelldateien', () => {
    expect(files.length).toBeGreaterThan(15);
  });

  for (const name of FORBIDDEN.slice(1)) {
    it(`nennt '${name}' nirgends in src/`, () => {
      const hits = files.filter((file) => readFileSync(file, 'utf8').includes(name));
      expect(hits).toEqual([]);
    });
  }

  it("kennt keinen Aktionstyp 'lie'", () => {
    // 'lie' als Teilwort steckt in zu vielen harmlosen Woertern, um den
    // Quelltext danach zu durchsuchen. Massgeblich ist das Enum.
    expect(actionTypeSchema.safeParse('lie').success).toBe(false);
    expect(actionTypeSchema.options).not.toContain('lie');
  });

  it('kennt keinen der vier verbotenen Aktionstypen', () => {
    for (const name of FORBIDDEN) {
      expect(actionTypeSchema.safeParse(name).success).toBe(false);
    }
  });
});
