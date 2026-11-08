import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openDatabase } from "../src/database.js";
import { saveSessions } from "../src/session-store.js";
import {
  createFollowUp,
  saveFollowUpAnswer
} from "../src/follow-up-store.js";
import { collectReportContext } from "../src/report-context.js";
import { saveReport, getReport } from "../src/report-store.js";
import { checkQuestion } from "../src/generate-follow-up.js";

function sample() {
  return JSON.parse(
    readFileSync(
      new URL("../fixtures/synthetic-session.json", import.meta.url),
      "utf8"
    )
  );
}

function withDatabase(run) {
  const db = openDatabase(":memory:");

  try {
    const input = sample();
    saveSessions(db, input);
    run(db, input);
  } finally {
    db.close();
  }
}

function addAnswer(db, sessionId, answer) {
  const question = createFollowUp(
    db,
    sessionId,
    "concise",
    "Would you like to add session context?"
  );

  return saveFollowUpAnswer(db, question.followUpId, answer);
}

function mockReport() {
  return {
    mode: "mock",
    narrative: {
      summary: "Fictional session summary.",
      observations: [],
      limitations: ["Synthetic demonstration data."],
      questionsForReview: []
    }
  };
}

test("unanswered questions do not become report context", () => {
  withDatabase((db) => {
    createFollowUp(
      db,
      "demo-001",
      "concise",
      "Any context to add?"
    );

    assert.deepEqual(
      collectReportContext(db, ["demo-001"]),
      []
    );
  });
});

test("context includes only answers for requested sessions", () => {
  withDatabase((db) => {
    const second = sample();
    second.sessions[0].sessionId = "demo-002";
    saveSessions(db, second);

    addAnswer(db, "demo-001", "Someone came to the door.");
    addAnswer(db, "demo-002", "I adjusted the camera.");

    const context = collectReportContext(db, ["demo-001"]);

    assert.equal(context.length, 1);
    assert.equal(context[0].sessionId, "demo-001");
    assert.equal(context[0].source, "user_reported");
    assert.equal(context[0].answer, "Someone came to the door.");
  });
});

test("later answers do not change a saved report snapshot", () => {
  withDatabase((db, input) => {
    addAnswer(db, "demo-001", "Someone came to the door.");

    const context = collectReportContext(db, ["demo-001"]);
    const saved = saveReport(
      db,
      input,
      mockReport(),
      null,
      context
    );

    addAnswer(db, "demo-001", "I also adjusted the camera.");

    const retrieved = getReport(db, saved.reportId);

    assert.deepEqual(retrieved.userReportedContext, context);
    assert.equal(retrieved.userReportedContext.length, 1);
    assert.equal(retrieved.facts.completedReps, 8);
    assert.equal(
      collectReportContext(db, ["demo-001"]).length,
      2
    );
  });
});

test("context from another session is rejected by report storage", () => {
  withDatabase((db, input) => {
    const second = sample();
    second.sessions[0].sessionId = "demo-002";
    saveSessions(db, second);

    addAnswer(db, "demo-002", "I adjusted the camera.");
    const context = collectReportContext(db, ["demo-002"]);

    assert.throws(
      () => saveReport(db, input, mockReport(), null, context),
      /different session/
    );
  });
});

test("common unsupported timing claims use a neutral question", () => {
  for (const question of [
    "What happened during the final cycle?",
    "Why did you stop today?",
    "What happened at the beginning?"
  ]) {
    assert.equal(
      checkQuestion(question),
      "Would you like to add any context about this session?"
    );
  }
});

test("a neutral question retains its wording", () => {
  const question =
    "Would you like to share any context about the incomplete cycle?";

  assert.equal(checkQuestion(question), question);
});