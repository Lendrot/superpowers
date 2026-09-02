import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * T01, Abnahmekriterium: "Boundary-Regel schlaegt bei Testimport an".
 *
 * Die Regel aus Doc 09 §9.1 ist der einzige Mechanismus, der die Engine
 * framework-frei haelt. Ohne diesen Test ist sie eine Zeile in einer
 * Konfigurationsdatei, von der niemand weiss, ob sie greift.
 */

const cwd = fileURLToPath(new URL('..', import.meta.url).href.replace(/\/tests\/$/, '/'));

async function lint(filePath: string, code: string): Promise<string[]> {
  const eslint = new ESLint({ cwd });
  const results = await eslint.lintText(code, { filePath, warnIgnored: false });
  return results.flatMap((result) => result.messages.map((message) => message.ruleId ?? 'unknown'));
}

describe('ESLint-Boundary fuer src/engine/**', () => {
  it('lehnt einen React-Import in der Engine ab', async () => {
    const rules = await lint('src/engine/__boundary_fixture__.ts', "import 'react';\n");
    expect(rules).toContain('no-restricted-imports');
  });

  it('lehnt einen Next-Import in der Engine ab', async () => {
    const rules = await lint('src/engine/__boundary_fixture__.ts', "import 'next/navigation';\n");
    expect(rules).toContain('no-restricted-imports');
  });

  it('lehnt einen Import aus der Persistenzschicht ab', async () => {
    const rules = await lint('src/engine/__boundary_fixture__.ts', "import '@/persistence/db';\n");
    expect(rules).toContain('no-restricted-imports');
  });

  it('lehnt Math.random() in der Engine ab (Regel 3)', async () => {
    const rules = await lint('src/engine/__boundary_fixture__.ts', 'export const x = Math.random();\n');
    expect(rules).toContain('no-restricted-properties');
  });

  it('lehnt Date.now() in der Engine ab (Regel 3)', async () => {
    const rules = await lint('src/engine/__boundary_fixture__.ts', 'export const t = Date.now();\n');
    expect(rules).toContain('no-restricted-properties');
  });

  it('laesst dieselben Importe ausserhalb der Engine zu', async () => {
    const rules = await lint('src/components/__boundary_fixture__.tsx', "import 'react';\n");
    expect(rules).not.toContain('no-restricted-imports');
  });

  it('laesst engine-interne Importe zu', async () => {
    const rules = await lint('src/engine/__boundary_fixture__.ts', "import '../core/rng.js';\n");
    expect(rules).not.toContain('no-restricted-imports');
  });
});
