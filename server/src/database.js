import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const defaultPath = fileURLToPath(
  new URL("../data/motion.sqlite", import.meta.url)
);

export function openDatabase(databasePath = defaultPath) {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const db = new DatabaseSync(databasePath);

  try {
    db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;

      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        exercise_id TEXT NOT NULL,
        side TEXT NOT NULL CHECK (side IN ('left', 'right')),
        angle_convention TEXT NOT NULL,
        data_source TEXT NOT NULL CHECK (data_source = 'synthetic'),
        started_at TEXT NOT NULL,
        session_json TEXT NOT NULL CHECK (json_valid(session_json)),
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS sessions_history
        ON sessions (exercise_id, side, started_at);

      CREATE TABLE IF NOT EXISTS reports (
        report_id TEXT PRIMARY KEY,
        mode TEXT NOT NULL CHECK (mode IN ('mock', 'gemini')),
        model TEXT,
        request_json TEXT NOT NULL CHECK (json_valid(request_json)),
        response_json TEXT NOT NULL CHECK (json_valid(response_json)),
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS report_sessions (
        report_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        PRIMARY KEY (report_id, session_id),
        FOREIGN KEY (report_id) REFERENCES reports(report_id),
        FOREIGN KEY (session_id) REFERENCES sessions(session_id)
      );
    `);

    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}