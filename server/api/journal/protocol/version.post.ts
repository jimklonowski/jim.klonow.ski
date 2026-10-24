import { shiftDays } from '#shared/utils/dates'
import { versionOverlaps, type ProtocolVersionRow } from '#shared/utils/protocolStore'
import { zProtocolVersionSave } from '#shared/utils/schemas'

interface ItemRow {
  id: number
  name: string
  kind: string
}

// Insert a version (no id) or update one (id present): one run of an item's dose and cadence.
// "Change from <date>" is an insert with no end: whatever version was running closes the day
// before, which is how the two-row hCG handover was built by hand and how the mapper
// (shared/utils/protocolStore.ts) reads a cadence change. Versions of one item never overlap,
// and a logged compound always knows its weekdays and its first day — the rings and the
// schedule check are built from exactly those.
export default defineEventHandler(async (event) => {
  requireWriteAccess(event)
  const body = await readValidatedJson(event, zProtocolVersionSave)
  const db = getDb(event)

  const item = await db.prepare('SELECT id, name, kind FROM protocol_items WHERE id = ?1').bind(body.item_id).first<ItemRow>()
  if (!item) throw createError({ statusCode: 404, message: 'No such protocol item' })
  if (item.kind === 'as_needed') throw createError({ statusCode: 400, message: 'An as-needed item has no schedule to version' })
  if (item.kind === 'logged' && (!body.from_date || !body.weekdays?.length)) {
    throw createError({ statusCode: 400, message: 'A logged compound needs a start date and its weekdays — the calendar rings and the schedule check are built from them' })
  }

  const { results } = await db.prepare(
    'SELECT id, item_id, from_date, to_date, dose_label, weekdays, note FROM protocol_versions WHERE item_id = ?1 ORDER BY from_date'
  ).bind(item.id).all<ProtocolVersionRow>()
  const others = (results ?? []).filter(v => v.id !== body.id)
  if (body.id != null && !(results ?? []).some(v => v.id === body.id)) {
    throw createError({ statusCode: 404, message: 'No such version of that item' })
  }

  // A new open version takes over: every version still running before its first day closes
  // the day before it. An edit never closes anything — it has to fit where it is.
  const closedAt = body.from_date ? shiftDays(body.from_date, -1) : null
  const closes = body.id == null && body.to_date == null && body.from_date
    ? others.filter(v => v.to_date == null && (v.from_date == null || v.from_date < body.from_date!))
    : []
  const projected = others.map(v => (closes.includes(v) ? { ...v, to_date: closedAt } : v))
  const clash = projected.find(v => versionOverlaps(body, v))
  if (clash) {
    throw createError({ statusCode: 409, message: `Overlaps the version from ${clash.from_date ?? 'the start'} to ${clash.to_date ?? 'now'} — end that one first, or pick other dates` })
  }

  const weekdays = body.weekdays ? JSON.stringify(body.weekdays) : null
  const befores = await Promise.all(closes.map(v => auditBefore(event, 'protocol_versions', v.id)))
  const editedBefore = body.id != null ? await auditBefore(event, 'protocol_versions', body.id) : null

  const statements = closes.map(v => db.prepare('UPDATE protocol_versions SET to_date = ?2 WHERE id = ?1').bind(v.id, closedAt))
  statements.push(body.id != null
    ? db.prepare(`
        UPDATE protocol_versions SET from_date = ?2, to_date = ?3, dose_label = ?4, weekdays = ?5, note = ?6
        WHERE id = ?1 AND item_id = ?7
      `).bind(body.id, body.from_date, body.to_date, body.dose_label, weekdays, body.note, item.id)
    : db.prepare(`
        INSERT INTO protocol_versions (item_id, from_date, to_date, dose_label, weekdays, note, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      `).bind(item.id, body.from_date, body.to_date, body.dose_label, weekdays, body.note, new Date().toISOString()))
  const written = await db.batch(statements)
  const id = body.id ?? written.at(-1)!.meta.last_row_id

  for (const [i, v] of closes.entries()) {
    await recordAudit(event, { table: 'protocol_versions', key: v.id, before: befores[i] ?? null, summary: `${item.name}: version closed ${closedAt}` })
  }
  await recordAudit(event, {
    table: 'protocol_versions',
    key: id,
    before: editedBefore,
    summary: `${item.name} ${body.dose_label ?? ''} from ${body.from_date ?? 'the start'}${body.to_date ? ` to ${body.to_date}` : ''}`.replace(/\s+/g, ' ')
  })
  return { ok: true, id, closed: closes.map(v => v.id) }
})
