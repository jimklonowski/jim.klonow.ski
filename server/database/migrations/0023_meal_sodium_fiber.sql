-- Sodium and fibre on a meal's figures (audit #43 item 71). NULL on rows saved before this and
-- on a hand entry that left them blank: the day's totals count such a meal as "no figure", so
-- they read as floors rather than as zero.
ALTER TABLE meal_estimates ADD COLUMN sodium_mg REAL;
ALTER TABLE meal_estimates ADD COLUMN fiber_g REAL;
