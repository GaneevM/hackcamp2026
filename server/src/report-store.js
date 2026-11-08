import { randomUUID } from "node:crypto";
import { reportRequestSchema } from "./validate-session.js";
import { reportSchema } from "./report-schema.js";
import { reportContextSchema } from "./report-context.js";
import { saveSessions } from "./session-store.js";

export function saveReport(
  db,
  input,
  report,
  model = null,
  userReportedContext = []
) {
  const data = reportRequestSchema.parse(input);
  const narrative = reportSchema.parse(report.narrative);
  const context = reportContextSchema.parse(userReportedContext);

  if (!["mock", "gemini"].includes(report.mode)) {
    throw new Error("Invalid report mode.");
  }

  if (
    report.mode === "gemini" &&
    (typeof model !== "string" || !model.trim())
  ) {
    throw new Error("Gemini reports require a model name.");
  }

  const sessionIds = new Set(
    data.sessions.map((session) => session.sessionId)
  );

  if (context.some((item) => !sessionIds.has(item.sessionId))) {
    throw new Error("Report context belongs to a different session.");
  }

  // Preserve source statistics even if saving the report later fails.
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
    userReportedContext: context,
    narrative
  };

  const requestSnapshot = {
    sessionData: data,
    userReportedContext: context
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
      JSON.stringify(requestSnapshot),
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