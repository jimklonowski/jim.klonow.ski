-- One row per scheduled-task run (audit #33). Written by runLoggedTask in
-- server/utils/taskRuns.ts and read by /api/health, which compares each task's last good run
-- against its cadence. Rows older than 90 days are pruned as new runs land.
CREATE TABLE IF NOT EXISTS task_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  ok INTEGER NOT NULL,
  result TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_task_runs_task_started ON task_runs(task, started_at);
