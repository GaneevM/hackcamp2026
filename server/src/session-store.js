import { reportRequestSchema } from "./validate-session.js";

function decodeSession(row) {
  if (!row) return null;

  return {
    schemaVersion: "1.0",
    dataSource: row.data_source,
    exerciseId: row.exercise_id,
    side: row.side,
    angleConvention: row.angle_convention,
    session: JSON.parse(row.session_json),
    savedAt: row.created_at
  };
}

export function saveSessions(db, input) {
  const data = reportRequestSchema.parse(input);

  const ids = data.sessions.map((session) => session.sessionId);

  if (new Set(ids).size !== ids.length) {
    const error = new Error("Duplicate session IDs in request.");
    error.status = 400;
    throw error;
  }

  const find = db.prepare(
    "SELECT * FROM sessions WHERE session_id = ?"
  );

  const insert = db.prepare(`
    INSERT INTO sessions (
      session_id,
      exercise_id,
      side,
      angle_convention,
      data_source,
      started_at,
      session_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN IMMEDIATE");

  try {
    for (const session of data.sessions) {
      const existing = find.get(session.sessionId);
      const sessionJson = JSON.stringify(session);

      if (existing) {
        const identical =
          existing.exercise_id === data.exerciseId &&
          existing.side === data.side &&
          existing.angle_convention === data.angleConvention &&
          existing.data_source === data.dataSource &&
          existing.session_json === sessionJson;

        if (!identical) {
          const error = new Error(
            "A session ID already exists with different data."
          );
          error.status = 409;
          throw error;
        }

        continue;
      }

      insert.run(
        session.sessionId,
        data.exerciseId,
        data.side,
        data.angleConvention,
        data.dataSource,
        session.startedAt,
        sessionJson,
        new Date().toISOString()
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return ids.map((id) => getSession(db, id));
}

export function getSession(db, sessionId) {
  const row = db.prepare(
    "SELECT * FROM sessions WHERE session_id = ?"
  ).get(sessionId);

  return decodeSession(row);
}

export function listSessions(db, limit = 50) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Session list limit must be between 1 and 100.");
  }

  const rows = db.prepare(`
    SELECT * FROM sessions
    ORDER BY started_at DESC, session_id ASC
    LIMIT ?
  `).all(limit);

  return rows.map(decodeSession);
}