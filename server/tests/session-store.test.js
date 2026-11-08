import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openDatabase } from "../src/database.js";
import {
  saveSessions,
  getSession,
  listSessions
} from "../src/session-store.js";

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
    run(db);
  } finally {
    db.close();
  }
}

test("saved sessions retain their statistics and metadata", () => {
  withDatabase((db) => {
    const input = sample();
    saveSessions(db, input);

    const saved = getSession(db, "demo-001");

    assert.deepEqual(saved.session, input.sessions[0]);
    assert.equal(saved.exerciseId, input.exerciseId);
    assert.equal(saved.side, input.side);
    assert.equal(saved.angleConvention, input.angleConvention);
    assert.equal(saved.dataSource, "synthetic");
    assert.ok(saved.savedAt);
  });
});

test("saving identical data twice does not create duplicates", () => {
  withDatabase((db) => {
    const input = sample();

    const first = saveSessions(db, input);
    const second = saveSessions(db, input);

    assert.equal(listSessions(db).length, 1);
    assert.equal(first[0].savedAt, second[0].savedAt);
  });
});

test("conflicting data cannot overwrite an existing session", () => {
  withDatabase((db) => {
    saveSessions(db, sample());

    const changed = sample();
    changed.sessions[0].completedReps = 3;

    assert.throws(
      () => saveSessions(db, changed),
      (error) => error.status === 409
    );

    assert.equal(
      getSession(db, "demo-001").session.completedReps,
      8
    );
  });
});

test("a conflict rolls back other inserts in the same request", () => {
  withDatabase((db) => {
    saveSessions(db, sample());

    const input = sample();
    const newSession = structuredClone(input.sessions[0]);
    newSession.sessionId = "demo-002";

    const conflicting = structuredClone(input.sessions[0]);
    conflicting.completedReps = 3;

    input.sessions = [newSession, conflicting];

    assert.throws(
      () => saveSessions(db, input),
      (error) => error.status === 409
    );

    assert.equal(getSession(db, "demo-002"), null);
    assert.equal(listSessions(db).length, 1);
  });
});

test("missing session IDs return null", () => {
  withDatabase((db) => {
    assert.equal(getSession(db, "not-present"), null);
  });
});

test("duplicate IDs in one request are rejected", () => {
  withDatabase((db) => {
    const input = sample();
    input.sessions.push(structuredClone(input.sessions[0]));

    assert.throws(
      () => saveSessions(db, input),
      (error) => error.status === 400
    );

    assert.equal(listSessions(db).length, 0);
  });
});