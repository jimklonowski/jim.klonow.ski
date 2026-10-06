-- Disc golf rounds were stored under two spellings: Whoop's sport_name ("disc-golf") and the
-- HealthKit workout type Apple files it under ("Disc Sports"). upsertWorkout now folds both to
-- "Disc Golf" (shared/utils/workoutTypes.ts); this brings the rows written before that into line.
-- Data only — no schema change.
UPDATE workouts SET workout_type = 'Disc Golf' WHERE lower(workout_type) IN ('disc-golf', 'disc golf', 'disc sports');
