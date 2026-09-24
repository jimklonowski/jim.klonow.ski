-- Write audit log (audit #36). One row per owner write to the tracked tables, holding the row as
-- it was BEFORE the write, so any delete or overwrite can be put back from /tools/data. Written
-- by server/utils/audit.ts; pruned after a year by the weekly audit:purge task, which also
-- removes a deleted photo's R2 files once it has been gone 30 days (purged_at).
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  row_key TEXT NOT NULL,
  summary TEXT,
  before TEXT,
  restored_at TEXT,
  purged_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_log_at ON audit_log(at);
CREATE INDEX IF NOT EXISTS idx_audit_log_row ON audit_log(table_name, row_key);
