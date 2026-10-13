import { localToday } from '#shared/utils/time'
import { zTickerRun } from '#shared/utils/schemas'
import type { TickerRecord, TickerRunResponse } from '#shared/types/ticker'
import { visitsForGuest } from '#shared/utils/tickerVisits'

// A finished game — the runner or the can crusher. The owner's score goes to that game's house
// record when it beats it; a guest's goes to their footprint for the day, which is that game's
// visitors' leaderboard. The crusher's record also remembers whether a wall was ever cleared.
export default defineEventHandler(async (event): Promise<TickerRunResponse> => {
  const auth = requireRole(event, 'owner', 'friend', 'doctor')
  const { score, game, cleared } = await readValidatedJson(event, zTickerRun)
  const today = localToday()
  const db = getDb(event)

  let record = ((await readTickerState(event))[game] as TickerRecord | undefined) ?? null
  let isRecord = false

  if (auth.role === 'owner') {
    const better = score > 0 && score > (record?.score ?? 0)
    // The runner has no end to reach; every other game remembers that it was finished once.
    const finishes = game !== 'runner'
    const nowCleared = finishes && cleared && !record?.cleared
    if (better || nowCleared) {
      record = {
        score: better ? score : record?.score ?? 0,
        date: better ? today : record?.date ?? today,
        ...(finishes ? { cleared: !!record?.cleared || cleared } : {})
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
