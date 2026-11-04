-- The Whoop fields the sync and webhook already receive and dropped (audit #43 item 57). On
-- health_metrics, from the recovery and sleep records: skin temperature, SpO2 and respiratory
-- rate (Whoop's own, kept apart from Apple's columns so the two sources never overwrite each
-- other), sleep consistency and efficiency. On workouts, from the workout record: the session's
-- strain and its heart-rate zone minutes (JSON, six zones 0–5).
ALTER TABLE health_metrics ADD COLUMN skin_temp_c REAL;
ALTER TABLE health_metrics ADD COLUMN whoop_spo2_pct REAL;
ALTER TABLE health_metrics ADD COLUMN whoop_resp_rate REAL;
ALTER TABLE health_metrics ADD COLUMN sleep_consistency_pct REAL;
ALTER TABLE health_metrics ADD COLUMN sleep_efficiency_pct REAL;
ALTER TABLE workouts ADD COLUMN strain REAL;
ALTER TABLE workouts ADD COLUMN hr_zones TEXT;
