import "dotenv/config";
import { readFile } from "node:fs/promises";
import { generateReport } from "./generate-report.js";

function redact(value) {
  let text = String(value);

  const key = process.env.GEMINI_API_KEY;
  if (key) {
    text = text.split(key).join("[REDACTED]");
  }

  return text
    .replace(/AIza[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/([?&]key=)[^&\s"]+/gi, "$1[REDACTED]");
}

try {
  const file = await readFile(
    new URL("../fixtures/synthetic-session.json", import.meta.url),
    "utf8"
  );

  await generateReport(JSON.parse(file));
  console.log("SUCCESS: Gemini generated a valid report.");
} catch (error) {
  console.log("Error type:", error.name);
  console.log("HTTP status:", error.status ?? "Not provided");
  console.log("Details:", redact(error.message));
}