/**
 * Laden und Schreiben der geprueften Datenbank.
 *
 * Die einzige Stelle im Projekt, die den Datenbestand von der Platte liest oder
 * dorthin schreibt. Gelesen wird nie ungeprueft: was hier herauskommt, hat das
 * Schema und die referentielle Pruefung bestanden — oder es kommt gar nichts
 * heraus.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { intelligenceDatabaseSchema } from '../domain/entities.js';
import type { IntelligenceDatabase } from '../domain/types.js';
import { checkIntegrity, hasErrors } from './integrity.js';
import type { IntegrityIssue } from './integrity.js';

export function emptyDatabase(): IntelligenceDatabase {
  return {
    companies: [],
    deals: [],
    ownerships: [],
    assets: [],
    commodities: [],
    sources: [],
    events: [],
    claims: [],
  };
}

export class DatabaseInvalidError extends Error {
  constructor(
    readonly path: string,
    readonly issues: readonly string[],
  ) {
    super(`Datenbank ${path} ist ungueltig:\n  ${issues.join('\n  ')}`);
    this.name = 'DatabaseInvalidError';
  }
}

export interface LoadResult {
  database: IntelligenceDatabase;
  issues: IntegrityIssue[];
}

/**
 * Laedt und prueft. Warnungen kommen mit zurueck, Fehler werfen — ein Bestand
 * mit gebrochenen Verweisen darf nicht in eine Karte oder einen Export laufen.
 */
export function loadDatabase(path: string): LoadResult {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));

  const parsed = intelligenceDatabaseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DatabaseInvalidError(
      path,
      parsed.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`),
    );
  }

  const issues = checkIntegrity(parsed.data);
  if (hasErrors(issues)) {
    throw new DatabaseInvalidError(
      path,
      issues.filter((issue) => issue.severity === 'error').map((issue) => `${issue.record}: ${issue.message}`),
    );
  }

  return { database: parsed.data, issues };
}

/**
 * Schreibt formatiert und mit sortierten Sammlungen. Beides dient demselben
 * Zweck: der Diff in Git soll lesbar sein und nicht davon abhaengen, in welcher
 * Reihenfolge ein Import die Datensaetze erzeugt hat.
 */
export function saveDatabase(path: string, database: IntelligenceDatabase): void {
  const parsed = intelligenceDatabaseSchema.parse(database);
  const issues = checkIntegrity(parsed);
  if (hasErrors(issues)) {
    throw new DatabaseInvalidError(
      path,
      issues.filter((issue) => issue.severity === 'error').map((issue) => `${issue.record}: ${issue.message}`),
    );
  }

  const byId = <T extends { id: string }>(records: readonly T[]): T[] =>
    [...records].sort((left, right) => left.id.localeCompare(right.id));

  const sorted: IntelligenceDatabase = {
    companies: byId(parsed.companies),
    deals: byId(parsed.deals),
    ownerships: byId(parsed.ownerships),
    assets: byId(parsed.assets),
    commodities: byId(parsed.commodities),
    sources: byId(parsed.sources),
    events: byId(parsed.events),
    claims: byId(parsed.claims),
  };

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
}
