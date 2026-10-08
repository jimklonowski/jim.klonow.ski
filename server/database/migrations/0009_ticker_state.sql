-- TICKER's memory (the /ticker pet page). Until 2026-10-08 the pet counter, the runner's high
-- score and the once-only reaction stamps lived in localStorage, so the pet on the phone and the
-- pet on the desktop remembered different things. Key/value JSON, like `profile`: the page writes
-- a handful of small keys (server/api/ticker/state.post.ts allowlists them) and reads them all in
-- one request. The demo sandbox has the table but keeps using the browser — it is shared by every
-- demo visitor, and one visitor's "already reacted" must not silence the next.
CREATE TABLE IF NOT EXISTS ticker_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,        -- JSON
  updated_at TEXT NOT NULL
);

-- Visitors' footprints: one row per guest (share-link session) per home-timezone day, created the
-- first time the guest opens /ticker that day. pets and best_run are what they left behind: the
-- owner's TICKER mentions them on its next look, and the best run is the visitors' leaderboard.
-- label is copied from the invite at the time (invites can be deleted; the footprint stays).
CREATE TABLE IF NOT EXISTS ticker_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,         -- YYYY-MM-DD, home timezone
  invite_id TEXT NOT NULL,    -- invites.id (sha256 hex) the session was minted from
  role TEXT NOT NULL,         -- 'friend' | 'doctor'
  label TEXT,
  pets INTEGER NOT NULL DEFAULT 0,
  best_run INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticker_visits_day ON ticker_visits(invite_id, date);
