// The one UPDATE behind the soda and water "undo" endpoints (audit #42 item 24).
//
// `json_remove` on an index past the end leaves the array as it was, but the row still MATCHES,
// so `meta.changes` read 1 and the handlers logged an audit entry (an "update" with a before
// image identical to the row) for a tap that removed nothing — a stale index from a widget whose
// list had just been refreshed. Matching on the index existing makes the change count mean what
// a caller needs: 1 = removed, 0 = nothing to remove. Binds: ?1 = date, ?2 = index (non-negative;
// the schema refuses a negative one, which SQLite rejects as a JSON path). Plain TS so the test
// can run the statement against the real schema in node:sqlite.

export type RemovableList = 'sodas' | 'water'

export function removeAtSql(column: RemovableList): string {
  return `UPDATE journal_entries
    SET ${column} = json_remove(${column}, '$[' || CAST(?2 AS INTEGER) || ']')
    WHERE date = ?1 AND json_array_length(${column}) > CAST(?2 AS INTEGER)`
}
