// The write behind putting a before-image back from /tools/data (server/utils/audit.ts,
// restoreAudit — audit #43 item 1).
//
// It used to be `INSERT OR REPLACE`, which SQLite carries out by DELETING the row in the way and
// inserting a new one — and D1 enforces foreign keys, so that delete fired `ON DELETE CASCADE`:
// reverting an edit to a protocol item silently removed every one of its versions (the dose
// history), with nothing logged to bring them back. An upsert updates the row in place, so no
// child row ever sees a delete. Every audited table keys on its PRIMARY KEY, which is the conflict
// target. Binds ?1…?N = the columns in order. Plain TS so the test can run it against the real
// schema in node:sqlite.

export function restoreUpsertSql(table: string, keyCol: string, cols: readonly string[]): string {
  const values = cols.map((_, i) => `?${i + 1}`).join(', ')
  const sets = cols.filter(c => c !== keyCol).map(c => `${c} = excluded.${c}`)
  // A snapshot holding only the key has nothing to update; re-creating the row is all it can do.
  const onConflict = sets.length ? `DO UPDATE SET ${sets.join(', ')}` : 'DO NOTHING'
  return `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${values}) ON CONFLICT(${keyCol}) ${onConflict}`
}
