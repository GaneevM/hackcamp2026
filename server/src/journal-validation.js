import {z} from 'zod';
const angle = z.number().finite().min(0).max(180).nullable();
const scopeSchema = z.string().min(1).max(500).regex(/^(guest|user-[A-Za-z0-9%._~-]+)$/);
export const journalSchema = z.object({
  scope: scopeSchema,
  session: z.object({
    id: z.string().min(1).max(100), date: z.string().datetime(),
    exercise: z.string().min(1).max(100), metric: z.string().max(100),
    movement: z.enum(['sit', 'reach', 'elbow', 'crossbody', 'pushup', 'wave']), side: z.enum(['left', 'right']),
    reps: z.number().int().min(0).max(10000), duration: z.number().finite().nonnegative(),
    angle, startAngle: angle, excursion: angle,
    confidence: z.number().int().min(1).max(5).nullable(),
    pain: z.number().int().min(0).max(10).nullable(),
    note: z.string().max(2000), manual: z.boolean(), checkin: z.literal(false),
    averageHoldSeconds:z.number().finite().nonnegative().nullable().optional(),
    variant:z.enum(['floor','wall','knees']).optional(),
    form:z.object({version:z.literal(1),average:z.number().min(0).max(100).nullable(),reps:z.array(z.object({}).catchall(z.number().finite())).max(10000)}).strict().nullable().optional()
  }).strict(),
  metrics: z.object({
    source: z.enum(['camera', 'manual']), startedAt: z.string().datetime(),
    durationSeconds: z.number().finite().nonnegative(),
    targetReps: z.number().int().positive().max(200).nullable(),
    angleConvention: z.enum(['flexion_deg_straight_is_0', 'hip_shoulder_elbow_angle_deg_arm_down_is_0', 'opposite_shoulder_shoulder_wrist_angle_deg', 'hand_wave_cycles_no_joint_angle']),
    minimumObservedAngleDeg: angle, maximumObservedAngleDeg: angle,
    trackingValidFraction: z.number().min(0).max(1).nullable(),
    trackingLossEvents: z.number().int().nonnegative(),
    incompleteCycles: z.number().int().nonnegative().nullable(),
    medianCompletionIntervalSeconds: z.number().finite().positive().nullable(),
    stopReason: z.literal('user_ended'),
    measurementProtocolId: z.literal('formnote-side-view-observed-extrema-v1')
  }).strict()
}).strict().superRefine((data, ctx) => {
  if (data.session.manual !== (data.metrics.source === 'manual'))
    ctx.addIssue({ code: 'custom', message: 'Session and measurement sources disagree.' });
  if (data.session.manual && ([data.session.angle,data.session.startAngle,data.session.excursion,data.metrics.minimumObservedAngleDeg,data.metrics.maximumObservedAngleDeg,data.metrics.trackingValidFraction,data.metrics.incompleteCycles,data.metrics.medianCompletionIntervalSeconds].some(value=>value!==null)||data.metrics.trackingLossEvents!==0))
    ctx.addIssue({ code:'custom', message:'Manual logs cannot contain camera measurements.' });
  if (data.metrics.minimumObservedAngleDeg!==null && data.metrics.maximumObservedAngleDeg!==null && data.metrics.minimumObservedAngleDeg>data.metrics.maximumObservedAngleDeg)
    ctx.addIssue({ code:'custom', message:'Minimum observed angle cannot exceed maximum.' });
  const expected = data.session.movement === 'wave' ? 'hand_wave_cycles_no_joint_angle' : data.session.movement === 'crossbody' ? 'opposite_shoulder_shoulder_wrist_angle_deg' : data.session.movement === 'reach'
    ? 'hip_shoulder_elbow_angle_deg_arm_down_is_0' : 'flexion_deg_straight_is_0';
  if (data.metrics.angleConvention !== expected)
    ctx.addIssue({ code: 'custom', message: 'Incorrect angle convention for movement.' });
  if(data.session.movement==='wave'&&[data.session.angle,data.session.startAngle,data.session.excursion,data.metrics.minimumObservedAngleDeg,data.metrics.maximumObservedAngleDeg].some(value=>value!==null))
    ctx.addIssue({code:'custom',message:'Wave repetitions do not measure joint angles.'});
});
export const journalScopeSchema = scopeSchema;
export const contextSchema = z.object({ scope: scopeSchema, answer: z.string().trim().min(1).max(2000) }).strict();
