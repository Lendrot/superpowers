/**
 * Kommandozeile fuer den Review-Loop.
 *
 * Die einzige Schicht, die Dateien liest und schreibt. Der Loop selbst
 * (`src/review/`) ist rein und weiss nichts von der Platte.
 *
 *   pnpm review validate <antwort.json>
 *   pnpm review next <audit.json> [--ci passing|failing|unknown]
 *   pnpm review audit <audit.json> [--ci …] [--out <datei.md>]
 *
 * Exitcodes: 0 in Ordnung, 1 Fehler/ungueltig, 2 HUMAN_REVIEW_REQUIRED.
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { renderAuditTrail } from '../review/audit.js';
import { parseReviewResponse, sortFindings } from '../review/findings.js';
import { decideNextAction } from '../review/loop.js';
import type { LoopAction } from '../review/loop.js';
import { CI_STATUSES, testRunSchema } from '../review/request.js';
import type { CiStatus, TestRun } from '../review/request.js';
import { auditTrailSchema } from '../review/rounds.js';
import type { AuditTrail } from '../review/rounds.js';

const EXIT_OK = 0;
const EXIT_INVALID = 1;
const EXIT_HUMAN_REQUIRED = 2;

const USAGE = `Verwendung:
  pnpm review validate <antwort.json>            Reviewer-Antwort gegen den Contract pruefen
  pnpm review next <audit.json> [--ci <status>]  naechste zulaessige Handlung ausgeben
  pnpm review audit <audit.json> [--ci <status>] [--out <datei.md>]

  --ci     passing | failing | unknown   (Vorgabe: unknown)
  --base   <testlauf.json>               Testlauf vor der ersten Fix-Runde`;

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(EXIT_INVALID);
}

function readJson(path: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    fail(`Datei nicht lesbar: ${path} (${error instanceof Error ? error.message : String(error)})`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`Kein gueltiges JSON: ${path} (${error instanceof Error ? error.message : String(error)})`);
  }
}

function flag(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return null;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) fail(`--${name} braucht einen Wert`);
  return value;
}

function ciFlag(argv: readonly string[]): CiStatus {
  const value = flag(argv, 'ci');
  if (value === null) return 'unknown';
  if (!(CI_STATUSES as readonly string[]).includes(value)) {
    fail(`--ci muss einer von ${CI_STATUSES.join(', ')} sein`);
  }
  return value as CiStatus;
}

function baselineFlag(argv: readonly string[]): TestRun | null {
  const path = flag(argv, 'base');
  if (path === null) return null;
  const parsed = testRunSchema.safeParse(readJson(path));
  if (!parsed.success) fail(`Testlauf in ${path} ist ungueltig: ${parsed.error.message}`);
  return parsed.data;
}

function loadTrail(path: string): AuditTrail {
  const parsed = auditTrailSchema.safeParse(readJson(path));
  if (!parsed.success) {
    fail(
      `Audit Trail ist ungueltig: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}

function describe(action: LoopAction): string {
  switch (action.type) {
    case 'REQUEST_REVIEW':
      return `REQUEST_REVIEW (Runde ${action.round}, Versuch ${action.attempt})`;
    case 'APPLY_FIXES':
      return `APPLY_FIXES (Runde ${action.round}, umsetzbar ${action.actionable.length}, Triage ${action.needs_human_triage.length})`;
    case 'FIX_FAILING_TESTS':
      return `FIX_FAILING_TESTS (Runde ${action.round})`;
    case 'WAIT_FOR_CI':
      return `WAIT_FOR_CI (Runde ${action.round})`;
    case 'HUMAN_REVIEW_REQUIRED':
      return `HUMAN_REVIEW_REQUIRED [${action.reason}] ${action.detail}`;
    case 'READY_FOR_HUMAN_MERGE':
      return 'READY_FOR_HUMAN_MERGE (Zusammenfuehren entscheidet ein Mensch)';
  }
}

function commandValidate(argv: readonly string[]): number {
  const path = argv[0];
  if (path === undefined) fail(USAGE);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    fail(`Datei nicht lesbar: ${path} (${error instanceof Error ? error.message : String(error)})`);
  }

  const parsed = parseReviewResponse(raw);
  if (parsed.status === 'unusable') {
    process.stderr.write(`UNUSABLE — ${parsed.error}\n`);
    return EXIT_INVALID;
  }

  const findings = sortFindings(parsed.response.findings);
  process.stdout.write(`OK — ${findings.length} Finding(s)\n`);
  for (const finding of findings) {
    process.stdout.write(
      `  ${finding.finding_id}  ${finding.severity.padEnd(8)} ${finding.category.padEnd(15)} ${finding.file}:${finding.lines}  (${finding.confidence.toFixed(2)})\n`,
    );
  }
  return EXIT_OK;
}

function commandNext(argv: readonly string[]): number {
  const path = argv[0];
  if (path === undefined) fail(USAGE);
  const trail = loadTrail(path);
  const action = decideNextAction({
    rounds: trail.rounds,
    ci: ciFlag(argv),
    baseline_test_run: baselineFlag(argv),
  });
  process.stdout.write(`${describe(action)}\n`);
  return action.type === 'HUMAN_REVIEW_REQUIRED' ? EXIT_HUMAN_REQUIRED : EXIT_OK;
}

function commandAudit(argv: readonly string[]): number {
  const path = argv[0];
  if (path === undefined) fail(USAGE);
  const trail = loadTrail(path);
  const action = decideNextAction({
    rounds: trail.rounds,
    ci: ciFlag(argv),
    baseline_test_run: baselineFlag(argv),
  });
  const markdown = renderAuditTrail(trail, action);
  const out = flag(argv, 'out');
  if (out === null) {
    process.stdout.write(markdown);
  } else {
    writeFileSync(out, markdown, 'utf8');
    process.stdout.write(`Audit geschrieben: ${out}\n`);
  }
  return action.type === 'HUMAN_REVIEW_REQUIRED' ? EXIT_HUMAN_REQUIRED : EXIT_OK;
}

function main(argv: readonly string[]): number {
  const [command, ...rest] = argv;
  switch (command) {
    case 'validate':
      return commandValidate(rest);
    case 'next':
      return commandNext(rest);
    case 'audit':
      return commandAudit(rest);
    default:
      process.stderr.write(`${USAGE}\n`);
      return EXIT_INVALID;
  }
}

process.exit(main(process.argv.slice(2)));
