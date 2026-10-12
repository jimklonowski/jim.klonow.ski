-- The visitors' leaderboard per mini-game (the /ticker PLAY menu, 2026-10-12). best_run stays
-- the runner's column; every later game keeps its best in one JSON object, so a new game is a new
-- key, not a new column: {"crusher": 412}. Written by server/api/ticker/run.post.ts with json_set,
-- read by readVisits (server/utils/tickerState.ts).
ALTER TABLE ticker_visits ADD COLUMN bests TEXT; -- JSON {game: best score}
