import { zIdOnly } from '#shared/utils/schemas'

// Deletes a saved conversation and its turns. Audited (audit #43 item 44): the thread's
// before-image carries its messages as `messages`, so the log entry holds the whole
// conversation and restoring it from /tools/data brings every turn back with its original id.
// The messages are removed explicitly in the same batch rather than left to the cascade — D1
// runs the cascade, but an explicit statement makes the batch's contents plain.
export default defineEventHandler(async (event) => {
  requireOwner(event)
  const { id } = await readValidatedJson(event, zIdOnly)
  const db = getDb(event)

  const { results: messages } = await db.prepare(
    'SELECT id, role, content, model, created_at FROM ask_messages WHERE thread_id = ?1 ORDER BY id'
  ).bind(id).all<Record<string, unknown>>()
  const thread = await db.prepare('SELECT * FROM ask_threads WHERE id = ?1').bind(id).first<Record<string, unknown>>()
  if (!thread) throw createError({ statusCode: 404, message: 'Not found' })

  const del = [
    db.prepare('DELETE FROM ask_messages WHERE thread_id = ?1').bind(id),
    db.prepare('DELETE FROM ask_threads WHERE id = ?1').bind(id)
  ]
  const audit = auditStatement(event, {
    table: 'ask_threads',
    key: id,
    before: { ...thread, messages: messages ?? [] },
    deleted: true,
    summary: `ask: ${String(thread.title).slice(0, 80)} (${(messages ?? []).length} turns)`
  })
  await db.batch(audit ? [...del, audit] : del)
  return { ok: true }
})
