-- AI follow-ups (audit #38).
--
-- Provenance: which model wrote each lab summary and digest, and a hash of the exact prompt it
-- was given, so a summary can be told apart from one written by an older prompt or model. NULL
-- on everything written before this migration.
ALTER TABLE labs_entries ADD COLUMN ai_summary_model TEXT;
ALTER TABLE labs_entries ADD COLUMN ai_summary_prompt_hash TEXT;
ALTER TABLE labs_entries ADD COLUMN ai_summary_at TEXT;
ALTER TABLE digests ADD COLUMN model TEXT;
ALTER TABLE digests ADD COLUMN prompt_hash TEXT;

-- Saved /ask conversations: one thread per conversation, its turns in order.
CREATE TABLE IF NOT EXISTS ask_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ask_threads_updated ON ask_threads(updated_at);

CREATE TABLE IF NOT EXISTS ask_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES ask_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  model TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ask_messages_thread ON ask_messages(thread_id, id);
