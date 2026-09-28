import type { AskThread } from '#shared/types/ask'
import { zAskThread } from '#shared/utils/schemas'

// One saved conversation, its turns in order — what reopening it on /ask loads.
export default defineEventHandler(async (event): Promise<AskThread> => {
  requireOwner(event)
  const { id } = zAskThread.parse({ id: getRouterParam(event, 'id') })
  const db = getDb(event)
  const thread = await db.prepare('SELECT id, title, updated_at FROM ask_threads WHERE id = ?1').bind(id)
    .first<{ id: number, title: string, updated_at: string }>()
  if (!thread) throw createError({ statusCode: 404, message: 'No such conversation' })
  const { results } = await db.prepare('SELECT role, content FROM ask_messages WHERE thread_id = ?1 ORDER BY id')
    .bind(id).all<{ role: 'user' | 'assistant', content: string }>()
  return { id: thread.id, title: thread.title, updatedAt: thread.updated_at, messages: results ?? [] }
})
