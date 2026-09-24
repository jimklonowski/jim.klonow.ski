# Pre-ledger one-off changes

Every schema change and data fix applied by hand before the migrations ledger existed (2026-09-24). **All of them are applied** to the real databases and folded into `../migrations/0001_baseline.sql` and `../schema.sql`. They're kept for the history and the reasoning in their headers. Don't run them again.

| File | What it did | Databases |
| --- | --- | --- |
| `seed-supplements.sql` | Initial supplement stack (plain INSERTs) | main |
| `migrate-xyzal.sql` | Allergy-pill → Xyzal switch (2026-09-01) | main |
| `seed-vaccinations.sql` | The three 2026-09-09 shots | main |
| `fix-labs-units-2026-09-15.sql` | CHW fasting flags, K/uL → cells/uL differential, CHW marker backfill | main |
| `migrate-soda-mini-can-2026-09-16.sql` | "Mini can" → "7.5oz mini can" in `journal_entries.sodas` | main (the demo reseeds) |
| `migrate-photo-crown-2026-09-17.sql` | Eight hairline photos → the new `crown` category | main |
| `add-cycle-planned-days-2026-09-21.sql` | `cycles.planned_days` | main |
| `add-whoop-sync-state-2026-09-22.sql` | `whoop_tokens` revoked / sync-state columns | main |
| `hash-invite-tokens.mjs` | Rehashed `invites.id` to sha256(token) in place. SQLite has no sha256(), so it's a script | main |

Older ALTERs (`labs_entries.ai_summary`, the `progress_photos` thumbnail and framing columns, the Whoop `health_metrics` columns, `journal_entries.sodas`, the `workout` → `notes` fold, `cycles.start_precision`, `vials.form`/`unit_count`) were only ever written as commented notes at the foot of `schema.sql`. They're applied too.

From now on a change is a numbered migration: `pnpm db:new <name>`, then mirror it into `schema.sql`.
