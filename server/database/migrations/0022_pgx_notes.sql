-- Drug-gene notes (audit #43 item 78): the owner's pharmacogenomic findings as hand-entered
-- rows — a gene, the genotype, the compounds and markers it bears on, and what it means. In the
-- database rather than a constant on purpose: the repository is public and a genotype is not.
-- The compound and protocol pages show a note beside a matching compound; the prompts read them.
CREATE TABLE IF NOT EXISTS pgx_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gene TEXT NOT NULL,                    -- "CYP2D6"
  genotype TEXT,                         -- "*1/*4 — intermediate metabolizer"
  compounds TEXT NOT NULL DEFAULT '[]',  -- JSON array of compound names the note applies to
  markers TEXT NOT NULL DEFAULT '[]',    -- JSON array of marker keys it applies to
  note TEXT NOT NULL,
  created_at TEXT NOT NULL
);
