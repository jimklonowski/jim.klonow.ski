import { zIdOnly } from '#shared/utils/schemas'

// Deletes a saved conversation and its turns (the messages cascade; they're also removed
// explicitly, since D1 enforces foreign keys only when a statement asks it to).
export default defineEventHandler(async (event) => {
  requireOwner(event)
  const { id } = await readValidatedJson(event, zIdOnly)
  const db = getDb(event)
  await db.batch([
    db.prepare('DELETE FROM ask_messages WHERE thread_id = ?1').bind(id),
    db.prepare('DELETE FROM ask_threads WHERE id = ?1').bind(id)
  ])
  return { ok: true }
})
