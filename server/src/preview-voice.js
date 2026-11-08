import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

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

function createWav(pcm, sampleRate) {
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_TTS_MODEL?.trim();
  const voice = process.env.GEMINI_TTS_VOICE?.trim() || "Kore";

  if (!apiKey || !model) {
    throw new Error(
      "Set GEMINI_API_KEY and GEMINI_TTS_MODEL in .env."
    );
  }

  const client = new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: "v1beta",
      timeout: 60000
    }
  });

  console.log(`Generating speech using ${model} on v1beta...`);

  const response = await client.models.generateContent({
    model,
    contents:
      "Say warmly and clearly: Hello! This is a voice test " +
      "for your exercise companion. Once connected, I can " +
      "respond to session events and help you add context " +
      "to your session summary.",
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voice
          }
        }
      }
    }
  });

  const candidate = response.candidates?.[0];

  if (candidate?.finishReason !== "STOP") {
    throw new Error(
      "Speech generation did not complete. Finish reason: " +
      (candidate?.finishReason || "not provided")
    );
  }

  const parts = (candidate.content?.parts || [])
    .map((part) => part.inlineData)
    .filter((part) => part?.data);

  if (parts.length !== 1) {
    throw new Error("Expected one complete audio response.");
  }

  const part = parts[0];
  const bytes = Buffer.from(part.data, "base64");
  const mimeType = part.mimeType || "";
  let wav;

  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WAVE"
  ) {
    wav = bytes;
  } else if (/^audio\/l16/i.test(mimeType)) {
    const rate = Number(
      mimeType.match(/rate=(\d+)/i)?.[1] || 24000
    );

    if (!bytes.length || bytes.length % 2 !== 0) {
      throw new Error("Invalid PCM audio length.");
    }

    wav = createWav(bytes, rate);
  } else {
    throw new Error(`Unexpected audio format: ${mimeType}`);
  }

  const directory = new URL("../data/", import.meta.url);
  const output = new URL("voice-preview.wav", directory);

  await mkdir(directory, { recursive: true });
  await writeFile(output, wav);

  console.log("SUCCESS: Audio saved.");
  console.log(fileURLToPath(output));
}

main().catch((error) => {
  console.error("Error type:", error.name);
  console.error("HTTP status:", error.status ?? "Not provided");
  console.error("Details:", redact(error.message));
  process.exitCode = 1;
});