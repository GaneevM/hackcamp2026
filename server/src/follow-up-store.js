import { randomUUID } from "node:crypto";
import { z } from "zod";

const modeSchema = z.enum([
  "quiet",
  "concise",
  "encouraging"
]);

const questionSchema = z.string().trim().min(1).max(300);
const answerSchema = z.string().trim().min(1).max(2000);

function fail(message, status) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function decode(row) {
  if (!row) return null;

  return {
    followUpId: row.follow_up_id,
    sessionId: row.session_id,
    mode: row.mode,
    question: row.question,
    answer: row.answer,
    answerSource: row.answer === null ? null : "user_reported",
    createdAt: row.created_at,
    answeredAt: row.answered_at
  };
}

export function createFollowUp(db, sessionId, mode, question) {
  const parsedMode = modeSchema.parse(mode);
  const parsedQuestion = questionSchema.parse(question);

  const session = db.prepare(
    "SELECT session_id FROM sessions WHERE session_id = ?"
  ).get(sessionId);

  if (!session) {
    fail("Session not found.", 404);
  }

  const id = randomUUID();

  db.prepare(`
    INSERT INTO follow_ups (
      follow_up_id,
      session_id,
      mode,
      question,
      created_at
    ) VALUES (?, ?, ?, ?, ?)
  `).run(
    id,
    sessionId,
    parsedMode,
    parsedQuestion,
    new Date().toISOString()
  );

  return getFollowUp(db, id);
}

export function getFollowUp(db, followUpId) {
  return decode(
    db.prepare(
      "SELECT * FROM follow_ups WHERE follow_up_id = ?"
    ).get(followUpId)
  );
}

export function listFollowUps(db, sessionId) {
  return db.prepare(`
    SELECT * FROM follow_ups
    WHERE session_id = ?
    ORDER BY created_at DESC, follow_up_id ASC
    LIMIT 50
  `).all(sessionId).map(decode);
}

export function saveFollowUpAnswer(db, followUpId, answer) {
  const parsedAnswer = answerSchema.parse(answer);

  const result = db.prepare(`
    UPDATE follow_ups
    SET answer = ?, answered_at = ?
    WHERE follow_up_id = ? AND answer IS NULL
  `).run(
    parsedAnswer,
    new Date().toISOString(),
    followUpId
  );

  const saved = getFollowUp(db, followUpId);

  if (!saved) {
    fail("Follow-up question not found.", 404);
  }

  if (result.changes === 0 && saved.answer !== parsedAnswer) {
    fail("This question already has a different saved answer.", 409);
  }

  return saved;
}