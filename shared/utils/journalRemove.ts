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

/** The entry a widget saw at the index it asks to remove. */
export type ExpectedEntry = { time: string, drink?: string, size?: string } | { time: string, oz: number }

/**
 * removeAtSql, but only when the entry at that index is still the one the widget showed. An index
 * alone came from whatever list the widget last held: with the phone having removed one pour, the
 * laptop's ✕ on its stale list took a different pour — and the audit log recorded it as a valid
 * change (audit #43 item 18). Field by field, not the element's JSON text: a volume stored as 12.0
 * reads back as 12. Binds after ?1/?2: sodas ?3 time, ?4 drink, ?5 size (absent = ''); water ?3
 * time, ?4 oz.
 */
export function removeExpectedSql(column: RemovableList): string {
  const at = (field: string) => `json_extract(${column}, '$[' || CAST(?2 AS INTEGER) || '].${field}')`
  const fields = column === 'sodas'
    ? `IFNULL(${at('time')}, '') = ?3 AND IFNULL(${at('drink')}, '') = ?4 AND IFNULL(${at('size')}, '') = ?5`
    : `IFNULL(${at('time')}, '') = ?3 AND ${at('oz')} = CAST(?4 AS REAL)`
  return `${removeAtSql(column)} AND ${fields}`
}

/** The ?3… binds for removeExpectedSql. */
export function expectedBindings(expected: ExpectedEntry): Array<string | number> {
  return 'oz' in expected
    ? [expected.time, expected.oz]
    : [expected.time, expected.drink ?? '', expected.size ?? '']
}
