-- Planned blood draws (shared/utils/plannedDraws.ts). A draw on file is a labs_entries row
-- written by an upload; this is the row that exists BEFORE it: the date it is booked for,
-- where, what is being drawn, and what the result is meant to answer. Status (upcoming / today /
-- overdue / done / missed) is derived from the date and the draws on file, never stored.
-- labs_date is the one stored link — the upload save sets it when a draw lands within a few
-- days of the plan. cycle_id/checkpoint_key book the draw as a cycle's baseline/mid/end/recovery
-- check; no foreign key, so deleting a cycle leaves the plan standing.
CREATE TABLE IF NOT EXISTS planned_draws (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  lab TEXT,
  panel TEXT,
  fasting INTEGER NOT NULL DEFAULT 1,
  purpose TEXT,
  cycle_id INTEGER,
  checkpoint_key TEXT,
  labs_date TEXT,
  created_at TEXT NOT NULL
);
