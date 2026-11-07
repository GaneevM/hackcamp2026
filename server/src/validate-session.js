import { z } from "zod";

const nullableNumber = (schema) => schema.nullable();

const sessionSchema = z.object({
  sessionId: z.string().min(1).max(100),
  startedAt: z.string().datetime(),
  durationSeconds: z.number().finite().nonnegative(),
  targetReps: z.number().int().positive().nullable(),
  completedReps: z.number().int().nonnegative(),

  medianRepDurationSeconds: nullableNumber(
    z.number().finite().positive()
  ),

  estimatedExtensionHoldAngleDeg: nullableNumber(
    z.number().finite().min(0).max(180)
  ),

  estimatedFlexionHoldAngleDeg: nullableNumber(
    z.number().finite().min(0).max(180)
  ),

  trackingValidFraction: nullableNumber(
    z.number().finite().min(0).max(1)
  ),

  trackingLossEvents: z.number().int().nonnegative(),
  incompleteCycles: z.number().int().nonnegative(),

  stopReason: z.enum([
    "user_ended",
    "goal_reached",
    "tracking_lost",
    "unknown"
  ])
}).strict();

export const reportRequestSchema = z.object({
  schemaVersion: z.literal("1.0"),
  dataSource: z.literal("synthetic"),
  exerciseId: z.literal("seated_elbow_bend"),
  side: z.enum(["left", "right"]),
  angleConvention: z.literal(
    "inner_joint_angle_deg_straight_is_180"
  ),
  sessions: z.array(sessionSchema).min(1).max(30)
}).strict();