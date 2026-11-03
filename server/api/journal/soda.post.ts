import { zSodaAdd } from '#shared/utils/schemas'
import { appendTapSql } from '#shared/utils/journalRemove'
import { localTimeNow, localToday } from '#shared/utils/time'

// Lightweight quick-add used by the dashboard soda widget - appends one entry to today's
// (or a given day's) `sodas` array without touching the rest of the journal_entries row,
// so it doesn't require loading the full day's entry form.
//
// The append happens inside a single INSERT ... ON CONFLICT statement via SQLite's json_insert
// (with the '$[#]' append path), rather than a SELECT-then-JS-modify-then-UPDATE - the latter
// raced under rapid repeated taps (two requests could both read the array before either write
// landed, so the second write would silently clobber the first's addition). The updated array is
// fetched with a follow-up SELECT rather than `... RETURNING sodas` - see soda.delete.ts for why.
export default defineEventHandler(async (event) => {
  requireWriteAccess(event)

  const body = await readValidatedJson(event, zSodaAdd)
  // The widget sends both; these fallbacks are for non-JS callers, in the home timezone (a
  // Worker's own clock is UTC, which put an evening soda on tomorrow's entry).
  const date = body.date ?? localToday()
  const time = body.time ?? localTimeNow()
  const entry = JSON.stringify({ time, drink: body.drink || undefined, size: body.size || undefined, id: body.id })

  const db = getDb(event)
  const before = await auditBefore(event, 'journal_entries', date)
  // With a tap id, a replay of a tap that already landed appends nothing (appendTapSql). The
  // upsert reports a change either way, so "appended" is read off the list's length against the
  // pre-write count — the audit image for the owner, its own read for the demo sandbox.
  const heldBefore = (JSON.parse(((before?.sodas as string | undefined)
    ?? (await db.prepare('SELECT sodas FROM journal_entries WHERE date = ?1').bind(date).first<{ sodas: string }>())?.sodas
    ?? '[]')) as unknown[]).length
  await db.prepare(appendTapSql('sodas')).bind(date, entry, body.id ?? null).run()

  const row = await db.prepare('SELECT sodas FROM journal_entries WHERE date = ?1').bind(date).first<{ sodas: string }>()
  const sodas = JSON.parse(row!.sodas) as Array<{ time: string, drink?: string, size?: string, id?: string }>
  const appended = sodas.length > heldBefore
  if (appended) await recordAudit(event, { table: 'journal_entries', key: date, before, summary: `+ soda on ${date}${body.drink ? ` (${body.drink})` : ''}` })
  return { ok: true, date, sodas, appended }
})
