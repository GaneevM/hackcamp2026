import { randomUUID } from "node:crypto";
import { reportRequestSchema } from "./validate-session.js";
import { reportSchema } from "./report-schema.js";
import { saveSessions } from "./session-store.js";

export function saveReport(db, input, report, model = null) {
  const data = reportRequestSchema.parse(input);
  const narrative = reportSchema.parse(report.narrative);

  if (!["mock", "gemini"].includes(report.mode)) {
    throw new Error("Invalid report mode.");
  }

  if (
    report.mode === "gemini" &&
    (typeof model !== "string" || !model.trim())
  ) {
    throw new Error("Gemini reports require a model name.");
  }

  // Preserve source sessions even if saving the report later fails.
  // Conflicting session IDs are rejected before creating a report.
  saveSessions(db, data);

  const reportId = randomUUID();
  const createdAt = new Date().toISOString();
  const storedModel = report.mode === "gemini" ? model : null;

  const response = {
    mode: report.mode,
    dataSource: data.dataSource,
    facts: {
      exerciseId: data.exerciseId,
      side: data.side,
      sessionCount: data.sessions.length,
      completedReps: data.sessions.reduce(
        (total, session) => total + session.completedReps,
        0
      )
    },
    narrative
  };

  db.exec("BEGIN IMMEDIATE");

  try {
    db.prepare(`
      INSERT INTO reports (
        report_id,
        mode,
        model,
        request_json,
        response_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      reportId,
      report.mode,
      storedModel,
      JSON.stringify(data),
      JSON.stringify(response),
      createdAt
    );

    const link = db.prepare(`
      INSERT INTO report_sessions (report_id, session_id)
      VALUES (?, ?)
    `);

    for (const session of data.sessions) {
      link.run(reportId, session.sessionId);
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return getReport(db, reportId);
}

export function getReport(db, reportId) {
  const row = db.prepare(`
    SELECT report_id, model, response_json, created_at
    FROM reports
    WHERE report_id = ?
  `).get(reportId);

  if (!row) return null;

  return {
    ...JSON.parse(row.response_json),
    reportId: row.report_id,
    model: row.model,
    createdAt: row.created_at
  };
}