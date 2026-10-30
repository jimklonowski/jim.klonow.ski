import { unscoredVersions } from '#shared/utils/protocolStore'
import { zProtocolItemSave } from '#shared/utils/schemas'

// Insert a protocol item (no id) or update one (id present): the thing taken and how it is
// tracked. A new item's first version comes with it (`start`); every later change to its dated
// history is written through version.post.ts. (name, kind) is unique, since
// the loader keys a logged item's rules by compound name — two "hCG" rows would score twice.
export default defineEventHandler(async (event) => {
  requireWriteAccess(event)
  const body = await readValidatedJson(event, zProtocolItemSave)
  const db = getDb(event)

  const twin = await db.prepare('SELECT id FROM protocol_items WHERE name = ?1 AND kind = ?2 AND id != ?3')
    .bind(body.name, body.kind, body.id ?? 0).first<{ id: number }>()
  if (twin) throw createError({ statusCode: 409, message: `${body.name} is already on the protocol as ${body.kind.replace('_', '-')}` })

  const fields = [body.name, body.kind, body.category, body.injected ? 1 : 0, body.on_hand ? 1 : 0, body.notes, body.stop_note, body.sort]
  const summary = `${body.name} (${body.kind.replace('_', '-')})`

  if (body.id != null) {
    const before = await auditBefore(event, 'protocol_items', body.id)
    if (!before && getAuth(event)?.role === 'owner') throw createError({ statusCode: 404, message: 'No such protocol item' })
    // The same rule version.post.ts holds a new version to, for the history a kind change inherits.
    if (body.kind === 'logged') {
      const { results } = await db.prepare('SELECT from_date, weekdays FROM protocol_versions WHERE item_id = ?1')
        .bind(body.id).all<{ from_date: string | null, weekdays: string | null }>()
      const loose = unscoredVersions(results ?? [])
      if (loose.length) {
        const which = loose.length === 1 ? 'one of its versions has' : `${loose.length} of its versions have`
        throw createError({ statusCode: 400, message: `A logged compound is scored from a start date and weekdays, and ${which} none — every past day would read as a missed dose. Give ${loose.length === 1 ? 'it' : 'them'} dates and days first, or keep it standing.` })
      }
    }
    await db.prepare(`
      UPDATE protocol_items SET name = ?2, kind = ?3, category = ?4, injected = ?5, on_hand = ?6, notes = ?7, stop_note = ?8, sort = ?9
      WHERE id = ?1
    `).bind(body.id, ...fields).run()
    await recordAudit(event, { table: 'protocol_items', key: body.id, before, summary })
    return { ok: true, id: body.id }
  }

  // A new item and its first version are one write. Two requests left a logged item whose
  // version was refused (no first day, no weekdays) on the protocol with no schedule, and saving
  // again was a 409 "already on the protocol" (audit #43 item 21). The version is checked first —
  // the same rule version.post.ts holds every later version to — and both rows go in one batch.
  const start = body.start
  if (start && body.kind === 'as_needed') throw createError({ statusCode: 400, message: 'An as-needed item has no schedule to start' })
  if (start && body.kind === 'logged' && (!start.from_date || !start.weekdays?.length)) {
    throw createError({ statusCode: 400, message: 'A logged compound needs a first day and its weekdays — the calendar rings and the schedule check are built from them' })
  }
  const now = new Date().toISOString()
  const statements = [db.prepare(`
    INSERT INTO protocol_items (name, kind, category, injected, on_hand, notes, stop_note, sort, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
  `).bind(...fields, now)]
  if (start) {
    // (name, kind) is unique, so the row just inserted is found by it inside the same transaction.
    statements.push(db.prepare(`
      INSERT INTO protocol_versions (item_id, from_date, to_date, dose_label, weekdays, note, created_at)
      VALUES ((SELECT id FROM protocol_items WHERE name = ?1 AND kind = ?2), ?3, NULL, ?4, ?5, NULL, ?6)
    `).bind(body.name, body.kind, start.from_date, start.dose_label, start.weekdays ? JSON.stringify(start.weekdays) : null, now))
  }
  const [item, version] = await db.batch(statements)
  const id = item!.meta.last_row_id
  await recordAudit(event, { table: 'protocol_items', key: id, before: null, summary })
  if (version) {
    await recordAudit(event, { table: 'protocol_versions', key: version.meta.last_row_id, before: null, summary: `${body.name} ${start!.dose_label ?? ''} from ${start!.from_date ?? 'the start'}`.replace(/\s+/g, ' ') })
  }
  return { ok: true, id }
})
