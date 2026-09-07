// @ts-check
import tseslint from 'typescript-eslint';

/**
 * Der maschinelle Teil der Architekturregeln aus CLAUDE.md.
 *
 * Die Schichtung ist durch Verzeichnisse plus diese Boundary-Regeln isoliert,
 * nicht durch getrennte Packages: `domain` kennt niemanden, `ingest` kennt
 * `domain`, `store` kennt `domain`, `cli` kennt alles. Was ein Test schlecht
 * pruefen kann, prueft der Linter.
 */
export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'data/**', 'web/vendor/**'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Ein mit `_` benannter Wert ist ausdruecklich ungenutzt — das ist die
      // uebliche Art, ein Feld beim Destrukturieren wegzunehmen.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      // Regel 1: Das Domain-Modell ist rein. Es liest keine Dateien, spricht
      // mit keinem Netzwerk und kennt keine Persistenz — sonst ist es nicht
      // mehr testbar, ohne die halbe Plattform hochzufahren.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'node:fs',
            'node:fs/*',
            'node:http',
            'node:https',
            'node:child_process',
            '@/ingest/*',
            '@/store/*',
            '@/cli/*',
          ],
        },
      ],
    },
  },
  {
    files: ['src/ingest/**/*.ts'],
    rules: {
      // Regel 2: Die Pipeline entscheidet, sie persistiert nicht. Wer schreibt,
      // ist `store` — sonst landen ungepruefte Daten in der Datenbank.
      'no-restricted-imports': [
        'error',
        {
          patterns: ['node:fs', 'node:fs/*', '@/store/*', '@/cli/*'],
        },
      ],
    },
  },
  {
    files: ['src/domain/**/*.ts', 'src/ingest/**/*.ts'],
    rules: {
      // Regel 3: Validierung und Confidence-Berechnung muessen reproduzierbar
      // sein. Ein Ergebnis, das von der Wanduhr abhaengt, ist nicht pruefbar —
      // Zeitpunkte kommen als Parameter herein (`now`), nie aus der Umgebung.
      'no-restricted-properties': [
        'error',
        {
          object: 'Date',
          property: 'now',
          message: 'Zeitpunkte werden hereingereicht (Parameter `now`), nicht aus der Wanduhr gelesen.',
        },
        {
          object: 'Math',
          property: 'random',
          message: 'Kein Zufall in Domain und Pipeline — IDs und Scores sind deterministisch.',
        },
      ],
    },
  },
);
