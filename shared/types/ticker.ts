import type { Role } from '#shared/utils/access'

// What /api/ticker/state serves the /ticker page: the pet's memory (migration 0009) and the
// visitors' footprints. The owner sees all of it; a guest sees the house figures only (the pet
// counter and the records), never the owner's reaction stamps or another guest's name.

export interface TickerPets {
  total: number
  /** The home-timezone day `today` was counted for. */
  date: string
  today: number
}

export interface TickerRecord {
  score: number
  date: string
}

export interface TickerVisit {
  date: string
  role: Role
  label: string | null
  pets: number
  best_run: number | null
}

export interface TickerVisitsSummary {
  /** Footprints (guest-days) on file. */
  total: number
  /** Pets given by visitors, all time. */
  pets: number
  /** Newest first; empty for a guest. */
  recent: TickerVisit[]
  /** The visitors' leaderboard's top entry. */
  best: { label: string | null, score: number, date: string } | null
}

export interface TickerStateResponse {
  /** Key → parsed JSON. For a guest only `pets` and `runner`. */
  state: Record<string, unknown>
  visits: TickerVisitsSummary
  me: { role: Role, label: string | null }
}

export interface TickerRunResponse {
  /** The owner's record after this run. */
  record: TickerRecord | null
  /** The visitors' leaderboard's top entry after this run. */
  visitorsBest: { label: string | null, score: number, date: string } | null
  /** Whether this run set a new record for the caller (the owner's, or the caller's own as a guest). */
  isRecord: boolean
}
