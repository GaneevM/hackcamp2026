import "dotenv/config";
import { createHash } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import { voiceMessages } from "./voice-messages.js";
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

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function main() {
  const mode = process.argv[2] || "concise";

  if (!Object.hasOwn(voiceMessages, mode)) {
    throw new Error("Choose quiet, concise, or encouraging.");
  }

  const model = process.env.GEMINI_TTS_MODEL?.trim();
  const voice = process.env.GEMINI_TTS_VOICE?.trim() || "Kore";

  if (!model) {
    throw new Error("GEMINI_TTS_MODEL is missing.");
  }

  const directory = new URL("../data/voice/", import.meta.url);
  await mkdir(directory, { recursive: true });

  const manifest = {
    mode,
    model,
    voice,
    clips: {}
  };

  for (const [event, text] of Object.entries(voiceMessages[mode])) {
    if (text === null) {
      manifest.clips[event] = null;
      continue;
    }

    const hash = createHash("sha256")
      .update(JSON.stringify({
        version: "speech-v1",
        model,
        voice,
        text
      }))
      .digest("hex");

    const fileName = `${hash}.wav`;
    const output = new URL(fileName, directory);

    if (await fileExists(output)) {
      console.log(`Already saved: ${event}`);
    } else {
      console.log(`Generating: ${event}`);
      const audio = await generateSpeech(text);
      await writeFile(output, audio);
      console.log(`Saved: ${event}`);
    }

    manifest.clips[event] = {
      text,
      fileName
    };
  }

  await writeFile(
    new URL(`${mode}.json`, directory),
    JSON.stringify(manifest, null, 2)
  );

  console.log(`SUCCESS: ${mode} voice clips are ready.`);
}

main().catch((error) => {
  console.error("Error type:", error.name);
  console.error("HTTP status:", error.status ?? "Not provided");
  console.error("Details:", redact(error.message));
  console.error("Completed clips remain saved for the next run.");
  process.exitCode = 1;
});