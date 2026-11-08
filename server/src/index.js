import "dotenv/config";
import express from "express";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./database.js";
import { createSessionRouter } from "./session-routes.js";
import { createReportRouter } from "./report-routes.js";
import { createFollowUpRouter } from "./follow-up-routes.js";
import {
  createFollowUpAudioRouter
} from "./follow-up-audio-routes.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const reportMode = process.env.REPORT_MODE || "mock";

if (!["mock", "gemini"].includes(reportMode)) {
  throw new Error("REPORT_MODE must be mock or gemini.");
}

const db = openDatabase();

const publicDirectory = fileURLToPath(
  new URL("../public/", import.meta.url)
);

const voiceDirectory = fileURLToPath(
  new URL("../data/voice/", import.meta.url)
);

app.use(express.json({ limit: "100kb" }));

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Exercise report backend",
    reportMode
  });
});

app.use("/api/sessions", createSessionRouter(db));
app.use("/api/reports", createReportRouter(db, reportMode));
app.use("/api/follow-ups", createFollowUpRouter(db));
app.use("/api/follow-ups", createFollowUpAudioRouter(db));

app.use(
  "/voice-assets",
  express.static(voiceDirectory, {
    dotfiles: "deny",
    index: false
  })
);

app.use(
  express.static(publicDirectory, {
    dotfiles: "deny",
    index: false
  })
);

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      error: "Request body must contain valid JSON."
    });
  }

  if (err.type === "entity.too.large") {
    return res.status(413).json({
      error: "Request body is too large."
    });
  }

  console.error("Request failed:", err.name);

  return res.status(500).json({
    error: "An unexpected server error occurred."
  });
});

const server = app.listen(port, "127.0.0.1", () => {
  console.log(`Backend running at http://localhost:${port}`);
  console.log(`Report mode: ${reportMode}`);
  console.log("SQLite session, report, and follow-up storage enabled.");
  console.log(
    `Voice test: http://localhost:${port}/voice-demo.html`
  );
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);