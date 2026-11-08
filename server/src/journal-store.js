import { z } from 'zod';
import { randomUUID } from 'node:crypto';

const angle = z.number().finite().min(0).max(180).nullable();
const scopeSchema = z.string().min(1).max(500).regex(/^(guest|user-[A-Za-z0-9%._~-]+)$/);
export const journalSchema = z.object({
  scope: scopeSchema,
  session: z.object({
    id: z.string().min(1).max(100), date: z.string().datetime(),
    exercise: z.string().min(1).max(100), metric: z.string().max(100),
    movement: z.enum(['sit', 'reach', 'elbow']), side: z.enum(['left', 'right']),
    reps: z.number().int().min(0).max(10000), duration: z.number().finite().nonnegative(),
    angle, startAngle: angle, excursion: angle,
    confidence: z.number().int().min(1).max(5).nullable(),
    pain: z.number().int().min(0).max(10).nullable(),
    note: z.string().max(2000), manual: z.boolean(), checkin: z.literal(false)
  }).strict(),
  metrics: z.object({
    source: z.enum(['camera', 'manual']), startedAt: z.string().datetime(),
    durationSeconds: z.number().finite().nonnegative(),
    targetReps: z.number().int().positive().max(200).nullable(),
    angleConvention: z.enum(['flexion_deg_straight_is_0', 'hip_shoulder_elbow_angle_deg_arm_down_is_0']),
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
  const expected = data.session.movement === 'reach'
    ? 'hip_shoulder_elbow_angle_deg_arm_down_is_0' : 'flexion_deg_straight_is_0';
  if (data.metrics.angleConvention !== expected)
    ctx.addIssue({ code: 'custom', message: 'Incorrect angle convention for movement.' });
});
export const journalScopeSchema = scopeSchema;
export const contextSchema = z.object({ scope: scopeSchema, answer: z.string().trim().min(1).max(2000) }).strict();

export function createJournalStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS journal_sessions (
    scope TEXT NOT NULL, session_id TEXT NOT NULL,
    session_json TEXT NOT NULL, metrics_json TEXT NOT NULL,
    context_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL,
    PRIMARY KEY (scope, session_id)
  )`);
  const decode = row => row ? {
    scope: row.scope, session: JSON.parse(row.session_json),
    metrics: JSON.parse(row.metrics_json), userReportedContext: JSON.parse(row.context_json),
    savedAt: row.created_at
  } : null;
  const get = (scope, id) => decode(db.prepare('SELECT * FROM journal_sessions WHERE scope = ? AND session_id = ?').get(scope, id));
  return {
    get,
    list(scope) {
      return db.prepare('SELECT * FROM journal_sessions WHERE scope = ? ORDER BY created_at DESC, session_id ASC LIMIT 100').all(scope).map(decode);
    },
    save(input) {
      const data = journalSchema.parse(input);
      const existing = get(data.scope, data.session.id);
      if (existing) {
        if (JSON.stringify(existing.session) !== JSON.stringify(data.session) || JSON.stringify(existing.metrics) !== JSON.stringify(data.metrics)) {
          const error = new Error('This session ID already contains different measurements.'); error.status = 409; throw error;
        }
        return existing;
      }
      db.prepare('INSERT INTO journal_sessions (scope, session_id, session_json, metrics_json, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(data.scope, data.session.id, JSON.stringify(data.session), JSON.stringify(data.metrics), new Date().toISOString());
      return get(data.scope, data.session.id);
    },
    answer(scope, id, answer) {
      const data = contextSchema.parse({ scope, answer });
      const row = get(scope, id);
      if (!row) return null;
      if (!row.userReportedContext.some(item => item.answer === data.answer)) {
        row.userReportedContext.push({ id: randomUUID(), source: 'user_reported', answer: data.answer, answeredAt: new Date().toISOString() });
        db.prepare('UPDATE journal_sessions SET context_json = ? WHERE scope = ? AND session_id = ?')
          .run(JSON.stringify(row.userReportedContext), scope, id);
      }
      return get(scope, id);
    },
    clear(scope) {
      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM journal_sessions WHERE scope = ?').run(scope);
        for (const table of ['journal_insights','journal_checkins']) if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) db.prepare('DELETE FROM '+table+' WHERE scope=?').run(scope);
        db.exec('COMMIT');
      } catch(error) { db.exec('ROLLBACK'); throw error; }
    }
  };
}
