-- The Health Auto Export deliveries already carry these and the webhook dropped them on the
-- floor (audit #43 item 56): daily steps, active and basal energy, respiratory rate, blood
-- oxygen, waist circumference, water logged on the watch, and when sleep began and ended (the
-- raw stamps as Health Auto Export prints them — bedtime regularity is derived later). The
-- webhook (shared/utils/healthExport.ts) fills them from now on; history arrives when Health
-- Auto Export is re-run over its range.
ALTER TABLE health_metrics ADD COLUMN steps INTEGER;
ALTER TABLE health_metrics ADD COLUMN active_kcal REAL;
ALTER TABLE health_metrics ADD COLUMN basal_kcal REAL;
ALTER TABLE health_metrics ADD COLUMN resp_rate REAL;
ALTER TABLE health_metrics ADD COLUMN spo2_pct REAL;
ALTER TABLE health_metrics ADD COLUMN waist_in REAL;
ALTER TABLE health_metrics ADD COLUMN dietary_water_oz REAL;
ALTER TABLE health_metrics ADD COLUMN sleep_start TEXT;
ALTER TABLE health_metrics ADD COLUMN sleep_end TEXT;
