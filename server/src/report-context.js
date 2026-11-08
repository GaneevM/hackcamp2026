import { z } from "zod";

export const reportContextSchema = z.array(
  z.object({
    followUpId: z.string().uuid(),
    sessionId: z.string().min(1).max(100),
    source: z.literal("user_reported"),
    answer: z.string().trim().min(1).max(2000),
    answeredAt: z.string().datetime()
  }).strict()
).max(150);

export function collectReportContext(db, sessionIds) {
  const findAnswers = db.prepare(`
    SELECT
      follow_up_id,
      session_id,
      answer,
      answered_at
    FROM follow_ups
    WHERE session_id = ? AND answer IS NOT NULL
    ORDER BY answered_at DESC, follow_up_id ASC
    LIMIT 5
  `);

  const context = [];

  for (const sessionId of new Set(sessionIds)) {
    const rows = findAnswers.all(sessionId);

    for (const row of rows) {
      context.push({
        followUpId: row.follow_up_id,
        sessionId: row.session_id,
        source: "user_reported",
        answer: row.answer,
        answeredAt: row.answered_at
      });
    }
  }

  return reportContextSchema.parse(context);
}