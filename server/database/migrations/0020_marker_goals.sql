-- Dated marker goals (audit #43 item 60; shared/utils/markerGoals.ts): what a draw is read
-- against, as rows a verdict can be computed from — "hematocrit seen falling", "estradiol under
-- 100 pg/mL by 2027-03-01" — instead of only the prose in server/data/protocolEvents.ts. A goal
-- may gate a planned cycle (cycle_id): the cycle's dossier and the home strip roll its goals up
-- to GO / NO-GO / UNDECIDED. The prompts read the rows too.
CREATE TABLE IF NOT EXISTS marker_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  marker TEXT NOT NULL,          -- biomarker key (app/data/biomarkers.ts)
  comparator TEXT NOT NULL,      -- 'below' | 'at_most' | 'above' | 'at_least' | 'falling' | 'rising'
  target REAL,                   -- the threshold, in the marker's unit; NULL for falling/rising
  by_date TEXT,                  -- when it should hold by, YYYY-MM-DD; NULL = no deadline
  cycle_id INTEGER REFERENCES cycles(id) ON DELETE SET NULL,  -- the cycle it gates, if one
  stated TEXT NOT NULL,          -- the day the goal was set: a trend goal needs a draw after it
  note TEXT,                     -- why, in a line
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_marker_goals_cycle ON marker_goals(cycle_id);
