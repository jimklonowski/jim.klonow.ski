import type { AskThreadSummary } from '#shared/types/ask'

// Saved /ask conversations, most recently active first. Owner-only, like the chat itself.
export default defineEventHandler(async (event): Promise<AskThreadSummary[]> => {
  requireOwner(event)
  return listRows(event, `
    SELECT t.id, t.title, t.updated_at, COUNT(m.id) AS turns
    FROM ask_threads t LEFT JOIN ask_messages m ON m.thread_id = t.id
    GROUP BY t.id ORDER BY t.updated_at DESC LIMIT 100
  `, r => ({
    id: r.id as number,
    title: r.title as string,
    updatedAt: r.updated_at as string,
    // Question/answer pairs rather than rows.
    exchanges: Math.floor((r.turns as number) / 2)
  }), { missingTableOk: true })
})
