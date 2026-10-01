-- AI body-composition summary for a DEXA scan, mirroring labs_entries (0004): the prose plus
-- its provenance — the model, a hash of the exact prompt, and when it was written. Written by
-- POST /api/dexa/generate-summary after an upload saves a scan, or on a regen from /labs/dexa.
ALTER TABLE dexa_entries ADD COLUMN ai_summary TEXT;
ALTER TABLE dexa_entries ADD COLUMN ai_summary_model TEXT;
ALTER TABLE dexa_entries ADD COLUMN ai_summary_prompt_hash TEXT;
ALTER TABLE dexa_entries ADD COLUMN ai_summary_at TEXT;
