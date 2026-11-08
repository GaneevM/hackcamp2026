import { Router } from "express";
import { reportRequestSchema } from "./validate-session.js";
import {
  saveSessions,
  getSession,
  listSessions
} from "./session-store.js";

export function createSessionRouter(db) {
  const router = Router();

  router.post("/", (req, res, next) => {
    const result = reportRequestSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        error: "Invalid session data",
        details: result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message
        }))
      });
    }

    try {
      const sessions = saveSessions(db, result.data);
      return res.json({ sessions });
    } catch (error) {
      if (error.status === 400 || error.status === 409) {
        return res.status(error.status).json({
          error: error.message
        });
      }

      return next(error);
    }
  });

  router.get("/", (req, res) => {
    const rawLimit = req.query.limit;

    if (
      rawLimit !== undefined &&
      (typeof rawLimit !== "string" || !/^\d+$/.test(rawLimit))
    ) {
      return res.status(400).json({
        error: "limit must be an integer between 1 and 100."
      });
    }

    const limit = rawLimit === undefined ? 50 : Number(rawLimit);

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({
        error: "limit must be an integer between 1 and 100."
      });
    }

    return res.json({
      sessions: listSessions(db, limit)
    });
  });

  router.get("/:sessionId", (req, res) => {
    const session = getSession(db, req.params.sessionId);

    if (!session) {
      return res.status(404).json({
        error: "Session not found."
      });
    }

    return res.json(session);
  });

  return router;
}