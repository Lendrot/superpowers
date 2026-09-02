// @ts-check
import tseslint from 'typescript-eslint';

/**
 * Doc 09 §9.1: Die Engine ist durch ein Verzeichnis plus eine Boundary-Regel
 * isoliert, nicht durch ein Package. Die Regeln hier sind der maschinelle Teil
 * der neun CLAUDE.md-Regeln (Doc 09 §9.2) — was ein Test nicht pruefen kann,
 * prueft der Linter.
 */
export default tseslint.config(
  {
    ignores: ['node_modules/**', '.next/**', 'out/**', 'data/**', 'coverage/**'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      // Regel 2: Kein Modul in src/engine/** importiert React, Next oder die DB.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'next',
            'next/*',
            'react',
            'react-*',
            'better-sqlite3',
            '@/app/*',
            '@/components/*',
            '@/persistence/*',
            '@/server/*',
          ],
        },
      ],
      // Regel 3: Jede Zufaelligkeit geht durch einen benannten RNG-Stream.
      // Auch Wanduhr-Zeit ist nichtdeterministisch und deshalb in der Engine verboten.
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Regel 3: benannten RNG-Stream benutzen (core/rng.ts), nie Math.random().' },
        { object: 'Date', property: 'now', message: 'Regel 3: Wanduhr-Zeit macht Laeufe nicht reproduzierbar.' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'Regel 3: Wanduhr-Zeit macht Laeufe nicht reproduzierbar.' },
      ],
    },
  },
);
