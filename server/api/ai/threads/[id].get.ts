import type { AskThread } from '#shared/types/ask'
import { zAskThread } from '#shared/utils/schemas'

// One saved conversation, its turns in order — what reopening it on /ask loads.
export default defineEventHandler(async (event): Promise<AskThread> => {
  requireOwner(event)
  // safeParse: a malformed id is the caller's 400, not an unhandled ZodError 500.
  const parsed = zAskThread.safeParse({ id: getRouterParam(event, 'id') })
  if (!parsed.success) throw createError({ statusCode: 400, message: 'Bad conversation id' })
  const { id } = parsed.data
  const db = getDb(event)
  const thread = await db.prepare('SELECT id, title, updated_at FROM ask_threads WHERE id = ?1').bind(id)
    .first<{ id: number, title: string, updated_at: string }>()
  if (!thread) throw createError({ statusCode: 404, message: 'No such conversation' })
  const { results } = await db.prepare('SELECT role, content FROM ask_messages WHERE thread_id = ?1 ORDER BY id')
    .bind(id).all<{ role: 'user' | 'assistant', content: string }>()
  return { id: thread.id, title: thread.title, updatedAt: thread.updated_at, messages: results ?? [] }
})
