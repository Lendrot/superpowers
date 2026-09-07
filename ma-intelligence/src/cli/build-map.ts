/**
 * Erzeugt die Daten fuer die Deutschland-Ansicht der Website.
 *
 *   pnpm build:map
 *
 * Das Buendel selbst entsteht in `store/map-bundle.ts` und ist dort getestet;
 * hier passiert nur das Lesen und Schreiben.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { loadDatabase } from '../store/database.js';
import { buildMapBundle } from '../store/map-bundle.js';

const DEFAULT_IN = resolve(process.cwd(), 'data/intelligence/verified/deutschland-ma.json');
const DEFAULT_OUT = resolve(process.cwd(), 'site/dist/assets/deutschland-ma.json');

function main(argv: readonly string[]): number {
  const inIndex = argv.indexOf('--in');
  const outIndex = argv.indexOf('--out');
  const input = inIndex === -1 ? DEFAULT_IN : (argv[inIndex + 1] ?? DEFAULT_IN);
  const out = outIndex === -1 ? DEFAULT_OUT : (argv[outIndex + 1] ?? DEFAULT_OUT);

  const { database, issues } = loadDatabase(input);
  const bundle = buildMapBundle(database);

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');

  process.stdout.write(
    `Kartendaten: ${bundle.meta.deal_count} Deals (${bundle.meta.located_count} mit Standort, ` +
      `${bundle.meta.undated_count} ohne Datum), geschrieben nach ${out}\n`,
  );
  for (const issue of issues) process.stdout.write(`  ${issue.severity}: ${issue.record} — ${issue.message}\n`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
