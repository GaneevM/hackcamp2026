import { randomUUID } from 'node:crypto';
import {journalSchema,contextSchema} from './journal-validation.js';
export {journalSchema,journalScopeSchema,contextSchema} from './journal-validation.js';

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
