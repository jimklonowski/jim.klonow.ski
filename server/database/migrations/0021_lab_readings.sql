-- Per-reading provenance (audit #43 item 72): what the report printed beside each value — the
-- bound qualifier (< / >), the unit and reference range as printed, the issuing lab, the assay
-- and the source PDF — as a JSON object keyed by marker like `markers`. NULL on draws saved
-- before this; the extractor fills it from here on and a same-date save merges it per key.
ALTER TABLE labs_entries ADD COLUMN readings TEXT;
