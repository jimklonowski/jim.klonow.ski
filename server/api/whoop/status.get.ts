import type { WhoopStatus } from '#shared/types/whoop'

// Connection state for the journal header's Whoop control: connected, when it last synced
// cleanly, why it stopped if it did, and when Whoop last pushed a record through the webhook.
// `connected` alone used to be the whole answer, which meant a rejected refresh token still read
// as a green check.
export default defineEventHandler(async (event): Promise<WhoopStatus> => {
  requireOwner(event)

  const db = getDb(event)
  const status = await getWhoopStatus(db)
  // Each webhook delivery is a `whoop:webhook` run (server/utils/taskRuns.ts). A missing
  // task_runs table just means no push history yet.
  const push = await db
    .prepare('SELECT MAX(started_at) AS at FROM task_runs WHERE task = \'whoop:webhook\' AND ok = 1')
    .first<{ at: string | null }>()
    .catch(() => null)
  return { ...status, lastPushAt: push?.at ?? null }
})
