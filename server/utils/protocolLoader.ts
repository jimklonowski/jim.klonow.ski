// The standing protocol for a request, from the protocol tables (migration 0013; edited on
// /journal/protocol). shared/utils/protocolStore.ts does the mapping and
// tests/protocolStore.test.mjs proves it lossless; this is the D1 read, the empty case and a
// per-request memo (the protocol plan, P4). A database without the tables, or with nothing in
// them, has no schedule — nothing is due, nothing is missed, the prompts carry no schedule line.
import type { H3Event } from 'h3'
import type { Role } from '#shared/utils/access'
import {
  EMPTY_PROTOCOL, protocolFromRows, type LoadedProtocol, type ProtocolItemRow, type ProtocolVersionRow
} from '#shared/utils/protocolStore'
import { getDb, isMissingTable } from './db'

export interface ProtocolRows {
  items: ProtocolItemRow[]
  versions: ProtocolVersionRow[]
}

/** `rows` null = the tables don't exist; empty tables are a database nobody has filled. Both
 * read as no schedule. */
export function protocolFrom(rows: ProtocolRows | null): LoadedProtocol {
  if (!rows || !rows.items.length) return EMPTY_PROTOCOL
  return { ...protocolFromRows(rows.items, rows.versions), source: 'tables' }
}

/** Both tables in one round trip, or null before migration 0013. Any other failure propagates —
 * a D1 incident must not read as "no schedule, then". */
export async function readProtocolRows(db: D1Database): Promise<ProtocolRows | null> {
  try {
    const [items, versions] = await db.batch<Record<string, unknown>>([
      db.prepare('SELECT id, name, kind, category, injected, on_hand, notes, stop_note, sort FROM protocol_items ORDER BY sort, name'),
      db.prepare('SELECT id, item_id, from_date, to_date, dose_label, weekdays, note FROM protocol_versions ORDER BY item_id, from_date')
    ])
    return {
      items: (items?.results ?? []) as unknown as ProtocolItemRow[],
      versions: (versions?.results ?? []) as unknown as ProtocolVersionRow[]
    }
  }
  catch (err) {
    if (isMissingTable(err)) return null
    throw err
  }
}

export async function loadProtocol(db: D1Database): Promise<LoadedProtocol> {
  return protocolFrom(await readProtocolRows(db))
}

/** The request's protocol, read once however many prompt builders ask for it (the digest, the
 * summaries and the ask console each consult it from several contexts). */
export function protocolFor(event: H3Event): Promise<LoadedProtocol> {
  const ctx = event.context as { protocol?: Promise<LoadedProtocol> }
  ctx.protocol ??= loadProtocol(getDb(event))
  return ctx.protocol
}

/**
 * What a session may be told: the request's protocol as loaded. The role parameter is the hook
 * for a sandbox rule — there is none now that every database answers from its own tables (the
 * demo seed carries the persona's schedule), but the endpoint keeps asking so a future rule has
 * one place to live.
 */
export function publicProtocol(protocol: LoadedProtocol, _role: Role | null | undefined): LoadedProtocol {
  return protocol
}
