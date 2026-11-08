import { GoogleGenAI } from "@google/genai";

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

export async function generateSpeech(text) {
  if (
    typeof text !== "string" ||
    !text.trim() ||
    text.length > 1000
  ) {
    throw new Error("Speech text must contain 1–1000 characters.");
  }

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

  const response = await client.models.generateContent({
    model,
    contents:
      "Read the following text aloud in a calm, clear, friendly " +
      "voice. Do not add any words:\n\n" + text,
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
    throw new Error("Speech generation did not complete.");
  }

  const parts = (candidate.content?.parts || [])
    .map((part) => part.inlineData)
    .filter((part) => part?.data);

  if (parts.length !== 1) {
    throw new Error("Expected one complete audio response.");
  }

  const part = parts[0];
  const bytes = Buffer.from(part.data, "base64");

  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WAVE"
  ) {
    return bytes;
  }

  const mimeType = part.mimeType || "";

  if (!/^audio\/l16/i.test(mimeType)) {
    throw new Error("Unsupported speech audio format.");
  }

  const sampleRate = Number(
    mimeType.match(/rate=(\d+)/i)?.[1] || 24000
  );

  if (
    !bytes.length ||
    bytes.length % 2 !== 0 ||
    !Number.isInteger(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 96000
  ) {
    throw new Error("Invalid PCM audio response.");
  }

  return createWav(bytes, sampleRate);
}