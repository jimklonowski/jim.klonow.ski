import { zJournalMove } from '#shared/utils/schemas'

// Moves a journal day to another date. The row logged under the wrong day — doses typed under
// yesterday just past midnight, a late entry filed under today — is renamed in place, so
// everything in it (vitals, doses, mixes, food, sodas, notes) travels together. The day page's
// Date field is this: journal/save is a full-column upsert on the body's date, so saving a form
// under a changed date used to replace whatever that day held and leave the original row behind.
//
// Only the hand-typed row moves. health_metrics (Whoop), workouts and progress photos keep their
// own dates; each has its own source of truth for when it happened.
//
// The move and both audit entries ride one db.batch, which D1 runs as one transaction: an update
// (or create) at `to` holding what that day had before, and a delete at `from` holding the moved
// row. Restoring the delete puts the day back where it was; restoring the update puts the
// replaced day back. A day the client didn't know was occupied is refused with a 409 unless
// `replace` says the user confirmed it, so a row that appeared since the page loaded (the Apple
// Health webhook writes today's weight) can't be clobbered by a stale confirm.
export default defineEventHandler(async (event) => {
  requireWriteAccess(event)
  const { from, to, replace } = await readValidatedJson(event, zJournalMove)

  const db = getDb(event)
  const [fromRes, toRes] = await db.batch<Record<string, unknown>>([
    db.prepare('SELECT * FROM journal_entries WHERE date = ?1').bind(from),
    db.prepare('SELECT * FROM journal_entries WHERE date = ?1').bind(to)
  ])
  const fromRow = fromRes?.results?.[0] ?? null
  const toRow = toRes?.results?.[0] ?? null
  if (!fromRow) throw createError({ statusCode: 404, message: `Nothing logged on ${from}` })
  if (toRow && !replace) throw createError({ statusCode: 409, message: `${to} already has an entry — reload the page to see it before replacing it` })

  const summary = `moved day ${from} → ${to}`
  const statements: D1PreparedStatement[] = []
  if (toRow) statements.push(db.prepare('DELETE FROM journal_entries WHERE date = ?1').bind(to))
  statements.push(db.prepare('UPDATE journal_entries SET date = ?2 WHERE date = ?1').bind(from, to))
  for (const stmt of [
    auditStatement(event, { table: 'journal_entries', key: to, before: toRow, summary }),
    auditStatement(event, { table: 'journal_entries', key: from, before: fromRow, deleted: true, summary })
  ]) {
    if (stmt) statements.push(stmt)
  }
  await db.batch(statements)

  return { ok: true, from, to, replaced: toRow != null }
})
