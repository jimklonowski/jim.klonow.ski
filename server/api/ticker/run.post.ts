import { localToday } from '#shared/utils/time'
import { zTickerRun } from '#shared/utils/schemas'
import type { TickerRecord, TickerRunResponse } from '#shared/types/ticker'

// A finished run of the runner. The owner's score goes to the house record when it beats it; a
// guest's goes to their footprint for the day, which is the visitors' leaderboard.
export default defineEventHandler(async (event): Promise<TickerRunResponse> => {
  const auth = requireRole(event, 'owner', 'friend', 'doctor')
  const { score } = await readValidatedJson(event, zTickerRun)
  const today = localToday()
  const db = getDb(event)

  let record = ((await readTickerState(event)).runner as TickerRecord | undefined) ?? null
  let isRecord = false

  if (auth.role === 'owner') {
    if (score > 0 && score > (record?.score ?? 0)) {
      record = { score, date: today }
      await writeTickerState(event, 'runner', record)
      isRecord = true
    }
  }
  else if (await touchVisit(event, auth)) {
    const mine = await db.prepare('SELECT MAX(best_run) AS best FROM ticker_visits WHERE invite_id = ?1')
      .bind(auth.inviteId).first<{ best: number | null }>()
    isRecord = score > 0 && score > (mine?.best ?? 0)
    await db.prepare('UPDATE ticker_visits SET best_run = MAX(COALESCE(best_run, 0), ?3), updated_at = ?4 WHERE invite_id = ?1 AND date = ?2')
      .bind(auth.inviteId, today, score, new Date().toISOString()).run()
  }

  const visits = await readVisits(event)
  return { record, visitorsBest: visits.best, isRecord }
})
