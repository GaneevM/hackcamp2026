import { z } from "zod";

export const reportSchema = z.object({
  summary: z.string().min(1).max(2000),
  observations: z.array(
    z.string().min(1).max(1000)
  ).max(10),
  limitations: z.array(
    z.string().min(1).max(1000)
  ).min(1).max(10),
  questionsForReview: z.array(
    z.string().min(1).max(1000)
  ).max(5)
}).strict();

export const reportJsonSchema = {
  type: "object",
  properties: {
    summary: {
      type: "string"
    },
    observations: {
      type: "array",
      items: { type: "string" }
    },
    limitations: {
      type: "array",
      items: { type: "string" }
    },
    questionsForReview: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: [
    "summary",
    "observations",
    "limitations",
    "questionsForReview"
  ],
  additionalProperties: false
};