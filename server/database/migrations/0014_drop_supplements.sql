-- The supplements table is retired (the protocol plan, P12; 2026-10-24). Migration 0013 copied
-- every row into protocol_items / protocol_versions as standing items, the /journal/protocol
-- page edits those, and the prompts read them (server/utils/supplementContext.ts) — nothing has
-- read this table since the P6 deploy. Run AFTER that deploy: the code before it still reads
-- the stack from here. The last state of the rows survives in the protocol tables and, for the
-- main database, in server/database/archive/seed-supplements.sql plus the audit log.
DROP TABLE IF EXISTS supplements;
