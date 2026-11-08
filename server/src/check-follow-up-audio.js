import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { generateSpeech } from "./generate-speech.js";

function redact(value) {
  let message = String(value);
  const key = process.env.GEMINI_API_KEY;

  if (key) {
    message = message.split(key).join("[REDACTED]");
  }

  return message
    .replace(/AIza[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/([?&]key=)[^&\s"]+/gi, "$1[REDACTED]");
}

async function main() {
  const id = process.argv[2];

  if (!id) {
    throw new Error("Provide the saved follow-up ID.");
  }

  const port = Number(process.env.PORT || 3001);

  const response = await fetch(
    `http://localhost:${port}/api/follow-ups/${encodeURIComponent(id)}`
  );

  if (!response.ok) {
    throw new Error(
      `Could not retrieve the question: HTTP ${response.status}.`
    );
  }

  const saved = await response.json();

  console.log("Speech model:", process.env.GEMINI_TTS_MODEL);
  console.log("Testing speech for the saved question...");

  const audio = await generateSpeech(saved.question);
  const output = new URL("../data/follow-up-check.wav", import.meta.url);

  await writeFile(output, audio);
  console.log("SUCCESS: Audio saved to data/follow-up-check.wav.");
}

main().catch((error) => {
  console.error("Error type:", error.name);
  console.error("HTTP status:", error.status ?? "Not provided");
  console.error("Details:", redact(error.message));
  process.exitCode = 1;
});