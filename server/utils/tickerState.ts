import type { H3Event } from 'h3'
import { localToday } from '#shared/utils/time'
import { TICKER_GAMES } from '#shared/types/ticker'
import type { TickerBest, TickerGame, TickerVisit, TickerVisitsRead } from '#shared/types/ticker'

// The /ticker pet's memory (migration 0009): a key/value JSON table read whole and written a key
// at a time, plus the visitors' footprints. Reads tolerate an environment that has not had the
// migration yet (missingTableOk) and degrade to "remembers nothing"; writes do not, so the first
// pet on an unmigrated database fails loudly instead of being silently forgotten.

export async function readTickerState(event: H3Event): Promise<Record<string, unknown>> {
  const rows = await listRows<{ key: string, value: string }>(
    event,
    'SELECT key, value FROM ticker_state',
    r => ({ key: String(r.key), value: String(r.value) }),
    { missingTableOk: true }
  )
  const out: Record<string, unknown> = {}
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value)
    }
    catch {
      out[r.key] = r.value
    }
  }
  return out
}

export async function writeTickerState(event: H3Event, key: string, value: unknown): Promise<void> {
  await getDb(event).prepare(`
    INSERT INTO ticker_state (key, value, updated_at) VALUES (?1, ?2, ?3)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(key, JSON.stringify(value ?? null), new Date().toISOString()).run()
}

/**
 * Folds a JSON object into a key (SQLite json_patch, RFC 7396) in one statement, or stores it
 * when the key is new or holds a non-object. Whole-object writes were last-writer-wins across
 * devices: a fed check from the phone erased one from the desktop. The client mirrors the same
 * rule (shared/utils/mergePatch.ts).
 */
export async function mergeTickerState(event: H3Event, key: string, patch: Record<string, unknown>): Promise<void> {
  await getDb(event).prepare(`
    INSERT INTO ticker_state (key, value, updated_at) VALUES (?1, ?2, ?3)
    ON CONFLICT(key) DO UPDATE SET
      value = CASE WHEN json_valid(value) AND json_type(value) = 'object' THEN json_patch(value, excluded.value) ELSE excluded.value END,
      updated_at = excluded.updated_at
  `).bind(key, JSON.stringify(patch), new Date().toISOString()).run()
}

function parseVisit(r: Record<string, unknown>): TickerVisit {
  let bests: TickerVisit['bests'] = {}
  try {
    const parsed = r.bests ? JSON.parse(String(r.bests)) as Record<string, unknown> : {}
    for (const game of TICKER_GAMES) if (typeof parsed[game] === 'number') bests[game] = parsed[game] as number
  }
  catch {
    bests = {}
  }
  return {
    date: String(r.date),
    role: r.role as TickerVisit['role'],
    label: (r.label as string | null) ?? null,
    pets: Number(r.pets ?? 0),
    best_run: r.best_run == null ? null : Number(r.best_run),
    bests
  }
}

/** A footprint's score in a game: the runner has its own column, the rest live in `bests`. */
function visitScore(v: TickerVisit, game: TickerGame): number | null {
  return game === 'runner' ? v.best_run : v.bests[game] ?? null
}

/**
 * Every footprint, summarized. The holder of each leaderboard comes back as `bestInviteIds` so
 * the endpoints can name them to the owner and to themself only (shared/utils/tickerVisits.ts)
 * — the response types never carry it. `bests` tolerates a table from before migration 0010.
 */
export async function readVisits(event: H3Event): Promise<TickerVisitsRead> {
  const visits = await listRows(
    event,
    'SELECT * FROM ticker_visits ORDER BY date DESC, id DESC',
    r => ({ ...parseVisit(r), invite_id: String(r.invite_id) }),
    { missingTableOk: true }
  )
  const bests: TickerVisitsRead['bests'] = {}
  const bestInviteIds: TickerVisitsRead['bestInviteIds'] = {}
  for (const game of TICKER_GAMES) {
    let best: TickerBest | null = null
    for (const v of visits) {
      const score = visitScore(v, game)
      if (score != null && (!best || score > best.score)) {
        best = { label: v.label, score, date: v.date }
        bestInviteIds[game] = v.invite_id
      }
    }
    bests[game] = best
  }
  return {
    total: visits.length,
    pets: visits.reduce((s, v) => s + v.pets, 0),
    recent: visits.slice(0, 5).map(({ invite_id: _omit, ...v }) => v),
    best: bests.runner ?? null,
    bests,
    bestInviteIds
  }
}

/** The SQL that records a guest's score in a game on today's footprint: MAX against what is there. */
export function guestScoreStatement(db: D1Database, game: TickerGame, inviteId: string, date: string, score: number, now: string): D1PreparedStatement {
  if (game === 'runner') {
    return db.prepare('UPDATE ticker_visits SET best_run = MAX(COALESCE(best_run, 0), ?3), updated_at = ?4 WHERE invite_id = ?1 AND date = ?2')
      .bind(inviteId, date, score, now)
  }
  return db.prepare(`
    UPDATE ticker_visits
    SET bests = json_set(COALESCE(bests, '{}'), '$.${game}', MAX(COALESCE(json_extract(bests, '$.${game}'), 0), ?3)), updated_at = ?4
    WHERE invite_id = ?1 AND date = ?2
  `).bind(inviteId, date, score, now)
}

/** A guest's own best in a game, across all their footprints. */
export async function guestBest(db: D1Database, game: TickerGame, inviteId: string): Promise<number> {
  const row = game === 'runner'
    ? await db.prepare('SELECT MAX(best_run) AS best FROM ticker_visits WHERE invite_id = ?1').bind(inviteId).first<{ best: number | null }>()
    : await db.prepare(`SELECT MAX(json_extract(bests, '$.${game}')) AS best FROM ticker_visits WHERE invite_id = ?1`).bind(inviteId).first<{ best: number | null }>()
  return row?.best ?? 0
}

/** The label on the invite a guest session was minted from — who they are, as the owner named them. */
export async function guestLabel(event: H3Event, auth: AuthContext): Promise<string | null> {
  if (!auth.inviteId) return null
  const row = await getRealDb(event).prepare('SELECT label FROM invites WHERE id = ?1').bind(auth.inviteId).first<{ label: string | null }>()
  return row?.label ?? null
}

/** Today's footprint for a guest, created on first sight; a no-op for anyone without an invite. */
export async function touchVisit(event: H3Event, auth: AuthContext): Promise<boolean> {
  if (!auth.inviteId) return false
  const label = await guestLabel(event, auth)
  const now = new Date().toISOString()
  await getDb(event).prepare(`
    INSERT INTO ticker_visits (date, invite_id, role, label, pets, best_run, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, 0, NULL, ?5, ?5)
    ON CONFLICT(invite_id, date) DO UPDATE SET updated_at = excluded.updated_at, label = COALESCE(excluded.label, label)
  `).bind(localToday(), auth.inviteId, auth.role, label, now).run()
  return true
}
