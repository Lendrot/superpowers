/**
 * T09 (Kern) — Headless-CLI.
 *
 *   pnpm sim --matches 1 --rounds 100 --agents 30 --seed 42 --llm off
 *
 * Gibt pro Match den Log-Hash aus. Der Hash ist der Gegenstand des
 * Abnahmekriteriums aus Doc 12, Tag 1: zwei Laeufe mit gleichem Seed muessen
 * denselben Wert liefern.
 *
 * Die CLI liegt ausserhalb der Engine und darf deshalb `node:fs` benutzen.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { resolveConfig, runMatch } from '../engine/index.js';
import type { MatchResult } from '../engine/index.js';

interface CliOptions {
  matches: number;
  rounds: number;
  agents: number;
  seed: number;
  llm: 'off' | 'mock' | 'live';
  report: string | null;
  quiet: boolean;
}

const USAGE = `
pnpm sim [Optionen]

  --matches <n>   Anzahl Matches (Default 1); Seed steigt je Match um 1
  --rounds <n>    Runden pro Match (Default 100)
  --agents <n>    Agenten pro Match (Default 30)
  --seed <n>      Basis-Seed (Default 42)
  --llm <mode>    off | mock | live (Default off; nur off ist implementiert)
  --report <pfad> JSON-Report zusaetzlich in eine Datei schreiben
  --quiet         nur die Zusammenfassung ausgeben
  --help          diese Hilfe
`.trim();

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    matches: 1,
    rounds: 100,
    agents: 30,
    seed: 42,
    llm: 'off',
    report: null,
    quiet: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = (): string => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`Option ${arg} erwartet einen Wert`);
      i += 1;
      return value;
    };

    switch (arg) {
      case '--matches': options.matches = readInt(next(), '--matches'); break;
      case '--rounds': options.rounds = readInt(next(), '--rounds'); break;
      case '--agents': options.agents = readInt(next(), '--agents'); break;
      case '--seed':
      case '--seed-base': options.seed = readInt(next(), '--seed'); break;
      case '--llm': options.llm = readLlmMode(next()); break;
      case '--report': options.report = next(); break;
      case '--quiet': options.quiet = true; break;
      case '--help':
      case '-h':
        console.log(USAGE);
        process.exit(0);
        break;
      default:
        throw new Error(`Unbekannte Option: ${arg}\n\n${USAGE}`);
    }
  }

  return options;
}

function readInt(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) throw new Error(`${name} erwartet eine ganze Zahl, bekam '${value}'`);
  return parsed;
}

function readLlmMode(value: string): CliOptions['llm'] {
  if (value === 'off' || value === 'mock' || value === 'live') return value;
  throw new Error(`--llm erwartet off | mock | live, bekam '${value}'`);
}

function summarize(result: MatchResult, seed: number, durationMs: number): Record<string, unknown> {
  return {
    seed,
    logHash: result.logHash,
    rounds: result.rounds,
    events: result.events,
    endReason: result.endReason ?? null,
    alive: result.leaderboard.filter((entry) => entry.alive).length,
    decisions: result.decisions,
    rejectRate: Number(result.rejectRate.toFixed(5)),
    rejects: result.rejects,
    actionCounts: result.actionCounts,
    eventCounts: result.eventCounts,
    topScorer: result.leaderboard[0] ?? null,
    durationMs: Math.round(durationMs),
  };
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const reports: Record<string, unknown>[] = [];

  for (let i = 0; i < options.matches; i += 1) {
    const seed = options.seed + i;
    const config = resolveConfig({
      seed,
      agentCount: options.agents,
      maxRounds: options.rounds,
      llmMode: options.llm,
    });

    const startedAt = performance.now();
    const result = runMatch(config);
    const summary = summarize(result, seed, performance.now() - startedAt);
    reports.push(summary);

    if (!options.quiet) {
      console.log(
        `match ${String(i + 1).padStart(3)}/${options.matches}  seed=${seed}  ` +
          `rounds=${result.rounds}  events=${result.events}  ` +
          `logHash=${result.logHash}  ${String(summary['durationMs'])}ms`,
      );
    }
  }

  const totalMs = reports.reduce((sum, entry) => sum + Number(entry['durationMs']), 0);
  console.log(
    `\n${options.matches} Match(es), ${totalMs} ms gesamt, ` +
      `${(totalMs / options.matches).toFixed(1)} ms pro Match`,
  );

  if (options.report) {
    mkdirSync(dirname(options.report), { recursive: true });
    writeFileSync(options.report, `${JSON.stringify({ options, matches: reports }, null, 2)}\n`, 'utf8');
    console.log(`Report geschrieben: ${options.report}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
