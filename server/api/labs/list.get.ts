import { readingNotesOn } from '../../data/markerCaveats'

export default defineEventHandler(async (event) => {
  const auth = requireLabsAuth(event)

  const range = dateRange(event, 'date')
  const rows = await listRows(event, `SELECT * FROM labs_entries ${range.where} ORDER BY date ASC`, parseLabsRow, { binds: range.binds })
  // The owner's per-draw assay notes ride on their draw (audit #43 item 48) — the prose stays
  // out of the client bundle and every reader of a draw has its caveats in hand. The demo
  // sandbox's made-up draws share no history with them, so a demo session gets none, even on a
  // matching date.
  const entries = auth.role === 'demo'
    ? rows
    : rows.map((row) => {
        const notes = readingNotesOn(row.date)
        return notes ? { ...row, notes } : row
      })
  return withEtag(event, entries)
})
