import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reportRequestSchema } from "../src/validate-session.js";
import { reportSchema } from "../src/report-schema.js";

function sample() {
  return JSON.parse(
    readFileSync(
      new URL("../fixtures/synthetic-session.json", import.meta.url),
      "utf8"
    )
  );
}

test("accepts the synthetic sample", () => {
  assert.equal(reportRequestSchema.safeParse(sample()).success, true);
});

test("rejects negative completed repetitions", () => {
  const data = sample();
  data.sessions[0].completedReps = -1;
  assert.equal(reportRequestSchema.safeParse(data).success, false);
});

test("rejects tracking fractions above 1", () => {
  const data = sample();
  data.sessions[0].trackingValidFraction = 91;
  assert.equal(reportRequestSchema.safeParse(data).success, false);
});

test("accepts unknown angle measurements as null", () => {
  const data = sample();
  data.sessions[0].estimatedExtensionHoldAngleDeg = null;
  data.sessions[0].estimatedFlexionHoldAngleDeg = null;
  assert.equal(reportRequestSchema.safeParse(data).success, true);
});

test("rejects unsupported angle conventions", () => {
  const data = sample();
  data.angleConvention = "straight_is_zero";
  assert.equal(reportRequestSchema.safeParse(data).success, false);
});

test("rejects empty session lists", () => {
  const data = sample();
  data.sessions = [];
  assert.equal(reportRequestSchema.safeParse(data).success, false);
});

test("rejects non-synthetic data in this demo", () => {
  const data = sample();
  data.dataSource = "patient";
  assert.equal(reportRequestSchema.safeParse(data).success, false);
});

test("rejects a generated report with missing limitations", () => {
  const report = {
    summary: "Synthetic demonstration.",
    observations: [],
    limitations: [],
    questionsForReview: []
  };

  assert.equal(reportSchema.safeParse(report).success, false);
});