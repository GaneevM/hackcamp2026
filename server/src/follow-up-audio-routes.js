import { Router } from "express";
import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  writeFile,
  rename,
  unlink
} from "node:fs/promises";
import { getFollowUp } from "./follow-up-store.js";
import { checkQuestion } from "./generate-follow-up.js";
import { generateSpeech } from "./generate-speech.js";

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export function createFollowUpAudioRouter(db) {
  const router = Router();
  const pendingAudio = new Map();
  const directory = new URL("../data/voice/", import.meta.url);

  router.post("/:followUpId/audio", async (req, res, next) => {
    const saved = getFollowUp(db, req.params.followUpId);

    if (!saved) {
      return res.status(404).json({
        error: "Follow-up question not found."
      });
    }

    if (saved.mode === "quiet") {
      return res.status(409).json({
        error: "Quiet-mode questions are displayed without speech."
      });
    }

    if (checkQuestion(saved.question) !== saved.question) {
      return res.status(409).json({
        error:
          "This older question contains unsupported time or order wording. " +
          "Use a newly generated question."
      });
    }

    const model = process.env.GEMINI_TTS_MODEL?.trim();
    const voice = process.env.GEMINI_TTS_VOICE?.trim() || "Kore";

    if (!model) {
      return res.status(500).json({
        error: "GEMINI_TTS_MODEL is missing."
      });
    }

    const hash = createHash("sha256")
      .update(JSON.stringify({
        version: "speech-v1",
        followUpId: saved.followUpId,
        question: saved.question,
        model,
        voice
      }))
      .digest("hex");

    const fileName = `follow-up-${hash}.wav`;
    const output = new URL(fileName, directory);

    try {
      await mkdir(directory, { recursive: true });

      if (!(await fileExists(output))) {
        let pending = pendingAudio.get(hash);

        if (!pending) {
          pending = (async () => {
            let audio;

            try {
              audio = await generateSpeech(saved.question);
            } catch (cause) {
              console.error("Follow-up speech failed:", cause.name);
              const error = new Error(
                "Speech generation is temporarily unavailable."
              );
              error.status = 502;
              throw error;
            }

            const temporary = new URL(
              `${fileName}.${randomUUID()}.tmp`,
              directory
            );

            try {
              await writeFile(temporary, audio);
              await rename(temporary, output);
            } finally {
              await unlink(temporary).catch(() => {});
            }
          })().finally(() => {
            pendingAudio.delete(hash);
          });

          pendingAudio.set(hash, pending);
        }

        await pending;
      }

      return res.json({
        followUpId: saved.followUpId,
        audioUrl: `/voice-assets/${fileName}`
      });
    } catch (error) {
      if (error.status === 502) {
        return res.status(502).json({
          error: error.message,
          question: saved.question
        });
      }

      return next(error);
    }
  });

  return router;
}