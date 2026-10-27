import type { Role } from '#shared/utils/access'

// What /api/ticker/state serves the /ticker page: the pet's memory (migration 0009) and the
// visitors' footprints. The owner sees all of it; a guest sees the house figures only (the pet
// counter and the records), never the owner's reaction stamps or another guest's name.

/** The mini-games (the PLAY menu). Each keeps its own record key and leaderboard. */
export type TickerGame = 'runner' | 'crusher' | 'world' | 'maze'
export const TICKER_GAMES: readonly TickerGame[] = ['runner', 'crusher', 'world', 'maze']

export interface TickerPets {
  total: number
  /** The home-timezone day `today` was counted for. */
  date: string
  today: number
}

export interface TickerRecord {
  score: number
  date: string
  /** The crusher: whether a whole wall has ever been cleared; the world: whether the month was ever finished; the maze: whether a level was ever eaten clean (sticky, for the achievements). */
  cleared?: boolean
  /** The world: the feats ever earned on a finished month (sticky, for the achievements). */
  feats?: string[]
}

/** A leaderboard's top entry. `label` is the invite label the owner gave that guest — shown to the owner and to that guest alone (shared/utils/tickerVisits.ts). */
export interface TickerBest {
  label: string | null
  score: number
  date: string
}

export interface TickerVisit {
  date: string
  role: Role
  label: string | null
  pets: number
  best_run: number | null
  /** Per-game bests other than the runner's (migration 0010): { crusher: 412 }. */
  bests: Partial<Record<TickerGame, number>>
}

export interface TickerVisitsSummary {
  /** Footprints (guest-days) on file. */
  total: number
  /** Pets given by visitors, all time. */
  pets: number
  /** Newest first; empty for a guest. */
  recent: TickerVisit[]
  /** The runner's leaderboard top — the same entry as `bests.runner`, kept by name for the page. */
  best: TickerBest | null
  /** Every game's leaderboard top. */
  bests: Partial<Record<TickerGame, TickerBest | null>>
}

/** readVisits' full read: the summary plus who holds each leaderboard, which never leaves the server. */
export interface TickerVisitsRead extends TickerVisitsSummary {
  bestInviteIds: Partial<Record<TickerGame, string | null>>
}

export interface TickerStateResponse {
  /** Key → parsed JSON. For a guest only `pets` and the game records. */
  state: Record<string, unknown>
  visits: TickerVisitsSummary
  me: { role: Role, label: string | null }
}

export interface TickerRunResponse {
  game: TickerGame
  /** The owner's record for that game after this run. */
  record: TickerRecord | null
  /** The visitors' leaderboard's top entry for that game after this run. */
  visitorsBest: TickerBest | null
  /** Whether this run set a new record for the caller (the owner's, or the caller's own as a guest). */
  isRecord: boolean
}
