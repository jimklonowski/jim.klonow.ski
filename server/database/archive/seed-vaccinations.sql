-- One-time seed for the vaccinations table — the three shots given 2026-09-09 at ~08:30, after
-- that morning's 07:50 blood draw. They are what prompted the log: the date of the previous
-- tetanus booster couldn't be found, so one was booked. Equivalent to adding them by hand on
-- /journal/vaccines — do one or the other, not both (plain INSERTs would duplicate).
--
--   npx wrangler d1 execute jim-klonow-ski-db --local  --file server/database/archive/seed-vaccinations.sql
--   npx wrangler d1 execute jim-klonow-ski-db --remote --file server/database/archive/seed-vaccinations.sql
INSERT INTO vaccinations (date, vaccine, product, notes, created_at) VALUES
  ('2026-09-09', 'COVID-19',          'Pfizer (Comirnaty)', 'Given ~08:30, after the 07:50 blood draw', '2026-09-09T13:30:00.000Z'),
  ('2026-09-09', 'Influenza (flu)',   NULL, 'Given ~08:30, after the 07:50 blood draw', '2026-09-09T13:30:00.000Z'),
  ('2026-09-09', 'Tetanus (Td/Tdap)', NULL, 'Given ~08:30, after the 07:50 blood draw. Booked because the date of the previous tetanus booster couldn''t be found; whether it was Td or Tdap is unconfirmed', '2026-09-09T13:30:00.000Z');
