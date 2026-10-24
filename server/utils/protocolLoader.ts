// The standing protocol for a request: the protocol tables (migration 0013) when they are seeded,
// the code constants otherwise. shared/utils/protocolStore.ts does the mapping and
// tests/protocolStore.test.mjs proves it lossless; this is the D1 read, the fallback decision and
// a per-request memo (the protocol plan, P4). Until the cutover (P11/P12) the constants stay in
// code: a database before 0013, or one migrated but not yet given `pnpm protocol:seed:remote`
// (the supplements copy alone makes no logged item), reads exactly as it does today.
import type { H3Event } from 'h3'
import type { Role } from '#shared/utils/access'
import { AS_NEEDED_COMPOUNDS, PROTOCOL_RULES, STANDING_COMPOUNDS } from '#shared/utils/protocolRules'
import {
  EMPTY_PROTOCOL, protocolFromRows, type LoadedProtocol, type ProtocolItemRow, type ProtocolVersionRow
} from '#shared/utils/protocolStore'
import { getDb, isMissingTable } from './db'

export interface ProtocolRows {
  items: ProtocolItemRow[]
  versions: ProtocolVersionRow[]
}

/** The schedule as the code constants spell it. `supplements` is empty: until P8 the stack is
 * read from its own table by supplementContext. */
export const PROTOCOL_CONSTANTS: LoadedProtocol = {
  rules: PROTOCOL_RULES,
  standing: STANDING_COMPOUNDS,
  asNeeded: AS_NEEDED_COMPOUNDS,
  supplements: [],
  source: 'constants'
}

/** `rows` null = the tables don't exist; empty tables are a database nobody has seeded. Both
 * read as the constants. Tables with rows are the protocol, whatever they hold — the demo
 * sandbox has only the supplements copy (no logged item), and that IS its protocol until P9. */
export function protocolFrom(rows: ProtocolRows | null): LoadedProtocol {
  if (!rows || !rows.items.length) return PROTOCOL_CONSTANTS
  return { ...protocolFromRows(rows.items, rows.versions), source: 'tables' }
}

/** Both tables in one round trip, or null before migration 0013. Any other failure propagates —
 * a D1 incident must not read as "the constants, then". */
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
 * What a session may be told. The demo sandbox has no schedule of its own yet (P9) and its
 * loader falls back to the owner's constants, which no demo session may see — so demo gets an
 * empty schedule instead, which is what the hidden adherence panel and rings already assume.
 * Every other role gets the request's protocol as loaded.
 */
export function publicProtocol(protocol: LoadedProtocol, role: Role | null | undefined): LoadedProtocol {
  return role === 'demo' && protocol.source !== 'tables' ? EMPTY_PROTOCOL : protocol
}
