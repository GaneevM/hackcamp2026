import { Router } from "express";
import { z } from "zod";
import { getSession } from "./session-store.js";
import { generateFollowUp } from "./generate-follow-up.js";
import {
  createFollowUp,
  getFollowUp,
  listFollowUps,
  saveFollowUpAnswer
} from "./follow-up-store.js";

const requestSchema = z.object({
  sessionId: z.string().min(1).max(100),
  mode: z.enum(["quiet", "concise", "encouraging"])
}).strict();

const answerSchema = z.object({
  answer: z.string().trim().min(1).max(2000)
}).strict();

function invalidInput(res, result) {
  return res.status(400).json({
    error: "Invalid follow-up data.",
    details: result.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message
    }))
  });
}

export function createFollowUpRouter(db) {
  const router = Router();
  const pendingQuestions = new Map();

  router.post("/", async (req, res, next) => {
    const result = requestSchema.safeParse(req.body);

    if (!result.success) {
      return invalidInput(res, result);
    }

    const { sessionId, mode } = result.data;
    const saved = getSession(db, sessionId);

    if (!saved) {
      return res.status(404).json({
        error: "Session not found."
      });
    }

    const existing = listFollowUps(db, sessionId)
      .find((item) => item.mode === mode);

    if (existing) {
      return res.json(existing);
    }

    const key = JSON.stringify([sessionId, mode]);
    let pending = pendingQuestions.get(key);

    if (!pending) {
      pending = (async () => {
        const input = {
          schemaVersion: saved.schemaVersion,
          dataSource: saved.dataSource,
          exerciseId: saved.exerciseId,
          side: saved.side,
          angleConvention: saved.angleConvention,
          sessions: [saved.session]
        };

        let generated;

        try {
          generated = await generateFollowUp(input, mode);
        } catch (cause) {
          console.error("Follow-up generation failed:", cause.name);

          const error = new Error(
            "Question generation is temporarily unavailable."
          );
          error.status = 502;
          throw error;
        }

        return createFollowUp(
          db,
          sessionId,
          mode,
          generated.question
        );
      })().finally(() => {
        pendingQuestions.delete(key);
      });

      pendingQuestions.set(key, pending);
    }

    try {
      return res.status(201).json(await pending);
    } catch (error) {
      if (error.status === 502) {
        return res.status(502).json({
          error: error.message
        });
      }

      return next(error);
    }
  });

  router.get("/:followUpId", (req, res) => {
    const saved = getFollowUp(db, req.params.followUpId);

    if (!saved) {
      return res.status(404).json({
        error: "Follow-up question not found."
      });
    }

    return res.json(saved);
  });

  router.post("/:followUpId/answer", (req, res, next) => {
    const result = answerSchema.safeParse(req.body);

    if (!result.success) {
      return invalidInput(res, result);
    }

    try {
      const saved = saveFollowUpAnswer(
        db,
        req.params.followUpId,
        result.data.answer
      );

      return res.json(saved);
    } catch (error) {
      if (error.status === 404 || error.status === 409) {
        return res.status(error.status).json({
          error: error.message
        });
      }

      return next(error);
    }
  });

  return router;
}