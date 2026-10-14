import { localToday } from '#shared/utils/time'
import { zTickerRun } from '#shared/utils/schemas'
import type { TickerRecord, TickerRunResponse } from '#shared/types/ticker'
import { visitsForGuest } from '#shared/utils/tickerVisits'

// A finished game — the runner, the can crusher or the world. The owner's score goes to that
// game's house record when it beats it; a guest's goes to their footprint for the day, which is
// that game's visitors' leaderboard. The crusher's record also remembers whether a wall was ever
// cleared; the world's whether the month was, and which feats a finished month ever earned.
export default defineEventHandler(async (event): Promise<TickerRunResponse> => {
  const auth = requireRole(event, 'owner', 'friend', 'doctor')
  const { score, game, cleared, feats } = await readValidatedJson(event, zTickerRun)
  const today = localToday()
  const db = getDb(event)

  let record = ((await readTickerState(event))[game] as TickerRecord | undefined) ?? null
  let isRecord = false

  if (auth.role === 'owner') {
    const better = score > 0 && score > (record?.score ?? 0)
    // The runner has no end to reach; every other game remembers that it was finished once.
    const finishes = game !== 'runner'
    const nowCleared = finishes && cleared && !record?.cleared
    const earned = game === 'world' && cleared ? feats.filter(f => !record?.feats?.includes(f)) : []
    if (better || nowCleared || earned.length) {
      record = {
        score: better ? score : record?.score ?? 0,
        date: better ? today : record?.date ?? today,
        ...(finishes ? { cleared: !!record?.cleared || cleared } : {}),
        ...(game === 'world' && (record?.feats?.length || earned.length) ? { feats: [...(record?.feats ?? []), ...earned] } : {})
      }
      await writeTickerState(event, game, record)
      isRecord = better
    }
  }
  else if (await touchVisit(event, auth)) {
    isRecord = score > 0 && score > await guestBest(db, game, auth.inviteId!)
    await guestScoreStatement(db, game, auth.inviteId!, today, score, new Date().toISOString()).run()
  }

  // The leaderboard's holder is named to the owner and to themself only.
  const visits = await readVisits(event)
  const bests = auth.role === 'owner' ? visits.bests : visitsForGuest(visits, auth.inviteId).bests
  return { game, record, visitorsBest: bests[game] ?? null, isRecord }
})
