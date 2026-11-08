import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openDatabase } from "../src/database.js";
import { saveReport, getReport } from "../src/report-store.js";

function sample() {
  return JSON.parse(
    readFileSync(
      new URL("../fixtures/synthetic-session.json", import.meta.url),
      "utf8"
    )
  );
}

function mockReport() {
  return {
    mode: "mock",
    narrative: {
      summary: "Fictional session with eight completed repetitions.",
      observations: [],
      limitations: ["Synthetic demonstration data."],
      questionsForReview: []
    }
  };
}

function withDatabase(run) {
  const db = openDatabase(":memory:");

  try {
    run(db);
  } finally {
    db.close();
  }
}

test("saved reports can be retrieved unchanged", () => {
  withDatabase((db) => {
    const report = mockReport();
    const saved = saveReport(db, sample(), report);
    const retrieved = getReport(db, saved.reportId);

    assert.deepEqual(retrieved, saved);
    assert.deepEqual(retrieved.narrative, report.narrative);
    assert.equal(retrieved.facts.completedReps, 8);
    assert.equal(retrieved.model, null);
    assert.ok(retrieved.createdAt);
  });
});

test("reports link to their source sessions", () => {
  withDatabase((db) => {
    const saved = saveReport(db, sample(), mockReport());

    const links = db.prepare(`
      SELECT session_id
      FROM report_sessions
      WHERE report_id = ?
    `).all(saved.reportId);

    assert.equal(links.length, 1);
    assert.equal(links[0].session_id, "demo-001");
  });
});

test("Gemini reports retain their model name", () => {
  withDatabase((db) => {
    const report = mockReport();
    report.mode = "gemini";

    const saved = saveReport(
      db,
      sample(),
      report,
      "test-model"
    );

    assert.equal(saved.mode, "gemini");
    assert.equal(saved.model, "test-model");
  });
});

test("missing report IDs return null", () => {
  withDatabase((db) => {
    assert.equal(getReport(db, "not-present"), null);
  });
});

test("invalid narratives are rejected without saving a report", () => {
  withDatabase((db) => {
    const report = mockReport();
    report.narrative.limitations = [];

    assert.throws(() => saveReport(db, sample(), report));

    const row = db.prepare(
      "SELECT COUNT(*) AS count FROM reports"
    ).get();

    assert.equal(row.count, 0);
  });
});

test("conflicting source sessions cannot create a report", () => {
  withDatabase((db) => {
    saveReport(db, sample(), mockReport());

    const changed = sample();
    changed.sessions[0].completedReps = 3;

    assert.throws(
      () => saveReport(db, changed, mockReport()),
      (error) => error.status === 409
    );

    const row = db.prepare(
      "SELECT COUNT(*) AS count FROM reports"
    ).get();

    assert.equal(row.count, 1);
  });
});