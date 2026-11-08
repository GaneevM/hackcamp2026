CREATE TABLE IF NOT EXISTS journal_sessions (
 scope TEXT NOT NULL, session_id TEXT NOT NULL, session_json TEXT NOT NULL, metrics_json TEXT NOT NULL,
 context_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, PRIMARY KEY(scope,session_id)
);
CREATE INDEX IF NOT EXISTS journal_history ON journal_sessions(scope,created_at DESC);
CREATE TABLE IF NOT EXISTS journal_checkins(scope TEXT NOT NULL,id TEXT NOT NULL,record_json TEXT NOT NULL,PRIMARY KEY(scope,id));
CREATE TABLE IF NOT EXISTS journal_insights (
 id TEXT PRIMARY KEY,scope TEXT NOT NULL,kind TEXT NOT NULL,cache_key TEXT NOT NULL,session_ids TEXT NOT NULL,
 payload_json TEXT NOT NULL,content_json TEXT NOT NULL,model TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(scope,cache_key)
);
CREATE INDEX IF NOT EXISTS insights_history ON journal_insights(scope,created_at DESC);
CREATE TABLE IF NOT EXISTS journal_epochs(scope TEXT PRIMARY KEY,epoch INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS ai_locks(scope TEXT NOT NULL,cache_key TEXT NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(scope,cache_key));
CREATE TABLE IF NOT EXISTS demo_usage(day TEXT NOT NULL,scope TEXT NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(day,scope));
