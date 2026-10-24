import { zProtocolItemSave } from '#shared/utils/schemas'

// Insert a protocol item (no id) or update one (id present): the thing taken and how it is
// tracked. Its dated history is written through version.post.ts. (name, kind) is unique, since
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
    await db.prepare(`
      UPDATE protocol_items SET name = ?2, kind = ?3, category = ?4, injected = ?5, on_hand = ?6, notes = ?7, stop_note = ?8, sort = ?9
      WHERE id = ?1
    `).bind(body.id, ...fields).run()
    await recordAudit(event, { table: 'protocol_items', key: body.id, before, summary })
    return { ok: true, id: body.id }
  }

  const result = await db.prepare(`
    INSERT INTO protocol_items (name, kind, category, injected, on_hand, notes, stop_note, sort, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
  `).bind(...fields, new Date().toISOString()).run()
  await recordAudit(event, { table: 'protocol_items', key: result.meta.last_row_id, before: null, summary })
  return { ok: true, id: result.meta.last_row_id }
})
