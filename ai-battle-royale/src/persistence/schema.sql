-- T27 — Persistenz-Schema (Doc 02 §2.5).
--
-- Gegenueber dem "minimal" markierten Spec-Auszug um zwei Spalten ergaenzt,
-- ohne die ein Resume nicht verlustfrei waere: `info_refs_json` (Doc 03
-- §3.8 — ohne sie erzeugt ein aus der DB wiederhergestelltes Event keine
-- Erkenntnis in Phase 2, obwohl das Original eine hatte) und `alliance_id`
-- (seit T20 ein Event-Feld). `id` und `match_id` jedes einzelnen Events
-- werden NICHT gespeichert: `id` ist eine reine Funktion von (round, seq)
-- (`core/ids.ts#eventId`), `match_id` gilt fuer die ganze Zeile ohnehin.
--
-- `llm_calls`, `decision_traces`, `persistent_lessons`, `sim_runs` sind Teil
-- des Spec-Schemas, haben in T27 aber noch keinen Schreiber — ihre Erzeuger
-- (T31 Debug-Traces, T32/T34 LLM-Gateway, `learning/persistence.ts` fuer den
-- Persistent-Agents-Modus, ein DB-Report fuer Long-Run-Batches) existieren
-- noch nicht. Sie stehen trotzdem hier, damit das Schema als Ganzes
-- migrationsfrei bleibt, wenn diese Teile kommen — keine Zeile wird
-- hineingeschrieben, solange das gilt.

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  seed INTEGER NOT NULL,
  config_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL,
  mode TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_log (
  match_id TEXT NOT NULL REFERENCES matches(id),
  round INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  actor_id TEXT,
  target_id TEXT,
  alliance_id TEXT,
  location_id TEXT,
  payload_json TEXT NOT NULL,
  visibility_json TEXT NOT NULL,
  info_refs_json TEXT NOT NULL,
  PRIMARY KEY (match_id, seq)
);

CREATE INDEX IF NOT EXISTS event_log_round ON event_log(match_id, round);

CREATE TABLE IF NOT EXISTS snapshots (
  match_id TEXT NOT NULL REFERENCES matches(id),
  round INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  state_hash TEXT NOT NULL,
  PRIMARY KEY (match_id, round)
);

-- Ab hier Teil des Spec-Schemas, in T27 ohne Schreiber (siehe Kommentar oben).

CREATE TABLE IF NOT EXISTS llm_calls (
  match_id TEXT NOT NULL REFERENCES matches(id),
  round INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  tokens_in INTEGER,
  tokens_out INTEGER,
  latency_ms INTEGER,
  raw_json TEXT,
  accepted INTEGER NOT NULL,
  reject_reason TEXT
);

CREATE TABLE IF NOT EXISTS decision_traces (
  match_id TEXT NOT NULL REFERENCES matches(id),
  round INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  trace_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS persistent_lessons (
  agent_archetype_id TEXT NOT NULL,
  lesson_key TEXT NOT NULL,
  statement TEXT NOT NULL,
  confidence REAL NOT NULL,
  evidence_count INTEGER NOT NULL,
  contradictory_count INTEGER NOT NULL,
  last_updated INTEGER NOT NULL,
  PRIMARY KEY (agent_archetype_id, lesson_key)
);

CREATE TABLE IF NOT EXISTS sim_runs (
  id TEXT PRIMARY KEY,
  batch_label TEXT,
  seed INTEGER NOT NULL,
  stats_json TEXT NOT NULL
);
