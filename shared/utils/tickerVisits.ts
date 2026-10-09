// The visitors' footprints as each role may see them. readVisits (server/utils/tickerState.ts)
// reads the whole table; the owner gets all of it, while a guest gets the house figures only —
// no footprint list, and the leaderboard's holder named only when it is the guest themself.
// /api/ticker/state used to hand every guest the top scorer's invite label, which is the name
// the owner gave that person. Kept app-import-free so the plain-node tests can run it.
import type { TickerVisitsRead, TickerVisitsSummary } from '../types/ticker.ts'

export function visitsForOwner(visits: TickerVisitsRead): TickerVisitsSummary {
  const { total, pets, recent, best } = visits
  return { total, pets, recent, best }
}

export function visitsForGuest(visits: TickerVisitsRead, inviteId: string | null | undefined): TickerVisitsSummary {
  const best = visits.best
    ? {
        score: visits.best.score,
        date: visits.best.date,
        label: inviteId != null && visits.bestInviteId === inviteId ? visits.best.label : null
      }
    : null
  return { total: visits.total, pets: visits.pets, recent: [], best }
}
