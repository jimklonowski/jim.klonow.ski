import type { H3Event } from 'h3'
import { localToday } from '#shared/utils/time'
import type { TickerVisit, TickerVisitsSummary } from '#shared/types/ticker'

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

function parseVisit(r: Record<string, unknown>): TickerVisit {
  return {
    date: String(r.date),
    role: r.role as TickerVisit['role'],
    label: (r.label as string | null) ?? null,
    pets: Number(r.pets ?? 0),
    best_run: r.best_run == null ? null : Number(r.best_run)
  }
}

export async function readVisits(event: H3Event): Promise<TickerVisitsSummary> {
  const visits = await listRows(
    event,
    'SELECT date, role, label, pets, best_run FROM ticker_visits ORDER BY date DESC, id DESC',
    parseVisit,
    { missingTableOk: true }
  )
  let best: TickerVisitsSummary['best'] = null
  for (const v of visits) {
    if (v.best_run != null && (!best || v.best_run > best.score)) best = { label: v.label, score: v.best_run, date: v.date }
  }
  return {
    total: visits.length,
    pets: visits.reduce((s, v) => s + v.pets, 0),
    recent: visits.slice(0, 5),
    best
  }
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
