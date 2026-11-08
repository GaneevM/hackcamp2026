import "dotenv/config";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { generateFollowUp } from "./generate-follow-up.js";
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
  const mode = process.argv[2] || "encouraging";

  const input = JSON.parse(
    await readFile(
      new URL("../fixtures/synthetic-session.json", import.meta.url),
      "utf8"
    )
  );

  console.log("Generating a question from the fictional session...");

  const followUp = await generateFollowUp(input, mode);

  console.log("Gemini question:", followUp.question);

  if (mode === "quiet") {
    console.log("Quiet mode: question displayed without speech.");
    return;
  }

  console.log("Generating speech for that question...");

  const audio = await generateSpeech(followUp.question);
  const directory = new URL("../data/", import.meta.url);
  const output = new URL("follow-up-preview.wav", directory);

  await mkdir(directory, { recursive: true });
  await writeFile(output, audio);

  console.log("SUCCESS: Spoken follow-up saved.");
  console.log(fileURLToPath(output));
}

main().catch((error) => {
  console.error("Error type:", error.name);
  console.error("HTTP status:", error.status ?? "Not provided");
  console.error("Details:", redact(error.message));
  process.exitCode = 1;
});