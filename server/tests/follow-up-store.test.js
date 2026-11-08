import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openDatabase } from "../src/database.js";
import {
  saveSessions,
  getSession
} from "../src/session-store.js";
import {
  createFollowUp,
  getFollowUp,
  saveFollowUpAnswer
} from "../src/follow-up-store.js";

function withDatabase(run) {
  const db = openDatabase(":memory:");

  try {
    const input = JSON.parse(
      readFileSync(
        new URL("../fixtures/synthetic-session.json", import.meta.url),
        "utf8"
      )
    );

    saveSessions(db, input);
    run(db);
  } finally {
    db.close();
  }
}

function question(db) {
  return createFollowUp(
    db,
    "demo-001",
    "encouraging",
    "Would you like to add context about ending the session?"
  );
}

test("questions are saved before an answer is provided", () => {
  withDatabase((db) => {
    const saved = question(db);

    assert.deepEqual(getFollowUp(db, saved.followUpId), saved);
    assert.equal(saved.sessionId, "demo-001");
    assert.equal(saved.answer, null);
    assert.equal(saved.answerSource, null);
    assert.equal(saved.answeredAt, null);
  });
});

test("answers are labeled user-reported without changing statistics", () => {
  withDatabase((db) => {
    const before = getSession(db, "demo-001");
    const saved = question(db);

    const answered = saveFollowUpAnswer(
      db,
      saved.followUpId,
      "Someone came to the door."
    );

    assert.equal(answered.answer, "Someone came to the door.");
    assert.equal(answered.answerSource, "user_reported");
    assert.ok(answered.answeredAt);

    assert.deepEqual(getSession(db, "demo-001"), before);
  });
});

test("resending an identical answer preserves the original record", () => {
  withDatabase((db) => {
    const saved = question(db);

    const first = saveFollowUpAnswer(
      db,
      saved.followUpId,
      "I was interrupted."
    );

    const second = saveFollowUpAnswer(
      db,
      saved.followUpId,
      "I was interrupted."
    );

    assert.deepEqual(second, first);
  });
});

test("a different answer cannot overwrite the original answer", () => {
  withDatabase((db) => {
    const saved = question(db);

    saveFollowUpAnswer(db, saved.followUpId, "I was interrupted.");

    assert.throws(
      () => saveFollowUpAnswer(
        db,
        saved.followUpId,
        "A different explanation."
      ),
      (error) => error.status === 409
    );

    assert.equal(
      getFollowUp(db, saved.followUpId).answer,
      "I was interrupted."
    );
  });
});

test("missing sessions and questions are handled", () => {
  withDatabase((db) => {
    assert.throws(
      () => createFollowUp(
        db,
        "missing-session",
        "concise",
        "Any context to add?"
      ),
      (error) => error.status === 404
    );

    assert.equal(getFollowUp(db, "missing-question"), null);

    assert.throws(
      () => saveFollowUpAnswer(db, "missing-question", "An answer."),
      (error) => error.status === 404
    );
  });
});

test("blank answers are rejected and leave the question unanswered", () => {
  withDatabase((db) => {
    const saved = question(db);

    assert.throws(
      () => saveFollowUpAnswer(db, saved.followUpId, "   ")
    );

    assert.equal(getFollowUp(db, saved.followUpId).answer, null);
  });
});