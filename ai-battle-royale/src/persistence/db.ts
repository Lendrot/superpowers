/**
 * T27 — Oeffnet/erzeugt die SQLite-Datei und wendet das Schema an.
 *
 * Ausserhalb der Engine (Doc 09 §9.1): `better-sqlite3` steht in
 * `eslint.config.js`s Restriktionsliste fuer `src/engine/**`, dieses Modul
 * ist der einzige Ort im Projekt, der es importiert.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';

const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql');

/**
 * `path` ist entweder ein Dateipfad (Verzeichnis wird nicht angelegt — das
 * ist Sache des Aufrufers) oder `:memory:` fuer Tests. Das Schema wird bei
 * jedem Oeffnen angewendet (`CREATE TABLE IF NOT EXISTS`), Wiederholung ist
 * folgenlos.
 */
export function openDatabase(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(SCHEMA_PATH, 'utf8'));
  return db;
}
