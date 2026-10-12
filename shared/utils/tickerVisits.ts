// The visitors' footprints as each role may see them. readVisits (server/utils/tickerState.ts)
// reads the whole table; the owner gets all of it, while a guest gets the house figures only —
// no footprint list, and each leaderboard's holder named only when it is the guest themself.
// /api/ticker/state used to hand every guest the top scorer's invite label, which is the name
// the owner gave that person. Kept app-import-free so the plain-node tests can run it.
import type { TickerBest, TickerGame, TickerVisitsRead, TickerVisitsSummary } from '../types/ticker.ts'

export function visitsForOwner(visits: TickerVisitsRead): TickerVisitsSummary {
  const { total, pets, recent, best, bests } = visits
  return { total, pets, recent, best, bests }
}

export function visitsForGuest(visits: TickerVisitsRead, inviteId: string | null | undefined): TickerVisitsSummary {
  const forGuest = (game: TickerGame, b: TickerBest | null | undefined): TickerBest | null =>
    b ? { score: b.score, date: b.date, label: inviteId != null && visits.bestInviteIds[game] === inviteId ? b.label : null } : null
  const bests: TickerVisitsSummary['bests'] = {}
  for (const [game, b] of Object.entries(visits.bests) as Array<[TickerGame, TickerBest | null | undefined]>) bests[game] = forGuest(game, b)
  return { total: visits.total, pets: visits.pets, recent: [], best: bests.runner ?? null, bests }
}
