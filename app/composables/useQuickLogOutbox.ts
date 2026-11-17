import type { SodaEntry, WaterEntry } from '#shared/types/journal'
import { LOGIN_PATH } from '#shared/utils/access'
import { setPendingTapSource } from '~/utils/journalPatch'

// The quick-log outbox (audit #43 item 43). A soda or water tap made with no network used to
// fail with "Failed to log …" and was gone — and tapping again later recorded the wrong time,
// since a tap carries the clock of the moment it was made. Now a tap that gets NO ANSWER (the
// network is down, not a 4xx/5xx the server actually gave) is kept here with its own date, time
// and a client-made id, shown as logged with a pending mark, and sent again when the browser
// comes back online or the tab is next looked at. The id makes the replay safe: the first try
// may have landed without its answer arriving, and the endpoints skip a tap whose id the day
// already holds (shared/utils/journalRemove.ts appendTapSql).
//
// Once a tap is in here, only two things take it out: it lands, or the server says the tap itself
// is wrong (replayVerdict). An expired session, a rate limit or a server error on the replay used
// to count as a refusal too, and the tap was deleted with a toast — the taps kept through a dead
// zone were lost to a sign-out that happened to fall before the replay (audit #44 item 4).
//
// Three more things a queued tap needed (audit #44 item 6):
//   - to stay on screen. The journal list overlays the queue on every server answer
//     (app/utils/journalPatch.ts), so a pending pour no longer drops off the day — and gets
//     tapped again — when the next tap gets through.
//   - to be sent as soon as the server is known to be answering: a tap that lands flushes the
//     queue (flushPending), not only the `online` event and the next look at the tab.
//   - a way out and a home. A pending row can be discarded (discardTap), and a tap carries the
//     kind of session it was made in: an owner's tap is never replayed into the demo sandbox, nor
//     a demo tap into the real journal — each waits for its own session.
//
// localStorage, not IndexedDB: the queue is a handful of small objects, read and written whole,
// and every write is wrapped — storage can be absent or throw in a private window, and a tap
// must still go to the server then. No service worker is involved: this is about keeping the
// tap, not about serving the app offline.

/** The kind of session a tap was made in — the only kind it is ever sent back into. */
export type TapRole = 'owner' | 'demo'

export type PendingTap
  = { id: string, kind: 'soda', date: string, time: string, drink?: string, size?: string, role?: TapRole }
    | { id: string, kind: 'water', date: string, time: string, oz: number, role?: TapRole }

type TapLists = { sodas?: SodaEntry[], water?: WaterEntry[] }

/** What the page does about a tap leaving the queue: both mirror the journal list. */
export interface OutboxHandlers {
  /** It landed: `lists` is the day as the server now holds it. */
  onLanded?: (tap: PendingTap, lists: TapLists) => void
  /** It is gone without landing — refused for good, or discarded by hand: take its row down. */
  onDropped?: (tap: PendingTap) => void
}

const KEY = 'quicklog:outbox'

/** A fresh tap id: 'tap-' + 24 hex chars (zTapId: [a-z0-9-]{8,40}). */
export function newTapId(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return `tap-${[...bytes].map(b => b.toString(16).padStart(2, '0')).join('')}`
}

/**
 * True for a request that never got an answer: ofetch's FetchError with no `response` and no
 * status (the dead-network signature — `<no response> fetch failed`). This is what decides
 * whether a FRESH tap is queued: an answer with a status (401, 400, 500) fails in front of the
 * person, who can act on it, so it is shown and not queued.
 */
export function isNoResponse(err: unknown): boolean {
  const e = err as { response?: unknown, statusCode?: number, status?: number } | null
  return !!e && typeof e === 'object' && !e.response && e.statusCode == null && e.status == null
}

/**
 * What a failed REPLAY says about a tap that is already queued — where throwing it away is
 * silent loss, since the person tapped hours ago and has moved on:
 *
 *   offline     no answer: the network is still down. Keep everything, stop.
 *   signed-out  401: the session ran out. Keep everything, stop, and say so — signing in is the fix.
 *   blocked     403 / 429: this browser is being turned away (a Cloudflare challenge, a session of
 *               another role, a rate limit), not this tap. Keep everything, stop.
 *   retry       408 / 425 / 5xx / anything unrecognized: the server stumbled. Keep the tap and go
 *               on to the next, so one tap the server chokes on cannot hold the others back.
 *   refused     any other 4xx (400, 404, 409, 422 …): the tap itself is unacceptable and always
 *               will be. Only this drops it, with a toast.
 */
export type ReplayVerdict = 'offline' | 'signed-out' | 'blocked' | 'retry' | 'refused'

export function replayVerdict(err: unknown): ReplayVerdict {
  if (isNoResponse(err)) return 'offline'
  const e = err as { response?: { status?: number }, statusCode?: number, status?: number }
  const status = e.statusCode ?? e.status ?? e.response?.status
  if (status === 401) return 'signed-out'
  if (status === 403 || status === 429) return 'blocked'
  if (typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 425) return 'refused'
  return 'retry'
}

function readQueue(): PendingTap[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? JSON.parse(raw) as unknown : []
    return Array.isArray(list) ? list as PendingTap[] : []
  }
  catch {
    return []
  }
}

function writeQueue(list: PendingTap[]) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list))
    else localStorage.removeItem(KEY)
  }
  catch {
    // Storage unavailable: nothing to keep the tap in — the caller's failure toast stands.
  }
}

/**
 * This session's queued taps, kept reactive for the widgets' pending marks and overlaid on the
 * journal list. Client-only state.
 */
const pending = ref<PendingTap[]>([])
let armed = false
let flushing: Promise<void> | null = null
let sessionRole: TapRole | null = null
let handlers: OutboxHandlers = {}

/**
 * Whether a queued tap belongs to this session. One with no role was queued before taps carried
 * one, and goes wherever it would have gone then; with no session set, nothing is held back.
 */
const mine = (tap: PendingTap) => !tap.role || !sessionRole || tap.role === sessionRole

/** Re-reads the queue into `pending`: this session's taps only. */
function sync() {
  pending.value = readQueue().filter(mine)
}

/**
 * Says which kind of session this is and what the page does when a tap leaves the queue. Called
 * once, by the arming below (and by the tests, which have no component to arm from).
 */
export function setOutboxSession(role: TapRole | null, next: OutboxHandlers = {}) {
  sessionRole = role
  handlers = next
  setPendingTapSource(() => pending.value)
  sync()
}

/** Is this stored entry one the outbox is still trying to send? (The widgets mark it.) */
export function isPendingId(id: string | undefined): boolean {
  return !!id && pending.value.some(t => t.id === id)
}

/**
 * Sends one tap. Resolves with the day's list the server now holds, or rejects. `replay` marks
 * a resend, which the endpoints treat the same way — the id is what dedupes, not the flag.
 */
async function send(tap: PendingTap): Promise<{ sodas?: SodaEntry[], water?: WaterEntry[] }> {
  if (tap.kind === 'soda') {
    return $fetch<{ sodas: SodaEntry[] }>('/api/journal/soda', { method: 'POST', body: { date: tap.date, time: tap.time, drink: tap.drink, size: tap.size, id: tap.id } })
  }
  return $fetch<{ water: WaterEntry[] }>('/api/journal/water', { method: 'POST', body: { date: tap.date, time: tap.time, oz: tap.oz, id: tap.id } })
}

/**
 * Keeps a tap that got no answer. Returns false when there is nowhere to keep it (no storage),
 * so the caller falls back to its failure toast.
 */
export function enqueueTap(tap: PendingTap): boolean {
  const list = readQueue()
  list.push(sessionRole ? { ...tap, role: sessionRole } : tap)
  writeQueue(list)
  const kept = readQueue().some(t => t.id === tap.id)
  if (kept) sync()
  return kept
}

/** Takes one tap out of the queue (it landed, was refused for good, or was discarded). */
function settle(id: string) {
  writeQueue(readQueue().filter(t => t.id !== id))
  sync()
}

/**
 * Throws away a tap that has not landed — the ✕ on a pending row. Without it a tap the server
 * kept failing on sat in the list as "pending" for good, with nothing to press. If the tap did
 * reach the server and only its answer was lost, the next refresh shows it as an ordinary row,
 * which has its own ✕.
 */
export function discardTap(id: string | undefined) {
  const tap = readQueue().find(t => t.id === id)
  if (!tap) return
  settle(tap.id)
  handlers.onDropped?.(tap)
}

// Said once per page load: the replay runs every time the tab is looked at, and a sign-in is a
// full page load, which starts this over.
let toldSignedOut = false

function tellSignedOut(toast: ReturnType<typeof useToast>, count: number) {
  if (toldSignedOut) return
  toldSignedOut = true
  toast.add({
    title: `Signed out — ${count} tap${count === 1 ? '' : 's'} kept`,
    description: 'Sign in again and they are sent with the times they were made.',
    color: 'warning',
    icon: 'i-lucide-log-in',
    duration: 0,
    actions: [{
      label: 'Sign in',
      // A full page load, like every other change of session in the app.
      onClick: () => {
        const from = window.location.pathname + window.location.search
        window.location.href = `${LOGIN_PATH}?${new URLSearchParams({ from })}`
      }
    }]
  })
}

/**
 * Sends every tap queued in this kind of session, oldest first. What a failure does to the queue
 * is replayVerdict's call: the network, the session or this browser being turned away stops the
 * pass with every tap kept; a server error keeps the tap and moves on to the next; only a tap the
 * server calls wrong in itself is dropped, with a toast. One flush at a time; a second call joins
 * the one in flight.
 */
export function flushOutbox(): Promise<void> {
  if (flushing) return flushing
  flushing = (async () => {
    const toast = useToast()
    // Taps a server error left in place this pass: tried once, then stepped over.
    const stepped = new Set<string>()
    for (;;) {
      const tap = readQueue().find(t => mine(t) && !stepped.has(t.id))
      if (!tap) break
      try {
        const lists = await send(tap)
        settle(tap.id)
        handlers.onLanded?.(tap, lists)
      }
      catch (err) {
        const verdict = replayVerdict(err)
        if (verdict === 'refused') {
          settle(tap.id)
          toast.add({ title: `A queued ${tap.kind} tap was refused`, description: `${tap.date} ${tap.time}: ${extractErrorMessage(err, 'the server said no')} — it was not logged.`, color: 'warning' })
          handlers.onDropped?.(tap)
        }
        else if (verdict === 'retry') {
          stepped.add(tap.id)
        }
        else {
          if (verdict === 'signed-out') tellSignedOut(toast, pending.value.length)
          break
        }
      }
    }
  })().finally(() => {
    flushing = null
  })
  return flushing
}

/**
 * Sends the queue if it holds anything for this session. Called by every replay trigger, and by
 * each write path after a tap of its own lands: an answer from the server is the best sign there
 * is that the queued ones will get one too, and the `online` event does not fire for a connection
 * that was only ever slow.
 */
export function flushPending() {
  if (readQueue().some(mine)) void flushOutbox()
}

/**
 * What a write path does when its tap got no answer: keep the tap, say so, and hand back the
 * entry to mirror into the day as though it had landed (its id marks it pending). Null when the
 * tap could not be kept (no storage) — the caller then shows its failure toast as before.
 */
export function keepTap(tap: PendingTap, toast: ReturnType<typeof useToast>): SodaEntry | WaterEntry | null {
  if (!enqueueTap(tap)) return null
  const what = tap.kind === 'soda' ? 'soda' : `${tap.oz} oz of water`
  toast.add({ title: `No connection — ${what} kept`, description: `Logged for ${tap.time}; it will be sent when you're back online.`, color: 'info', icon: 'i-lucide-cloud-off' })
  return tap.kind === 'soda'
    ? { time: tap.time, drink: tap.drink, size: tap.size, id: tap.id }
    : { time: tap.time, oz: tap.oz, id: tap.id }
}

/**
 * The outbox as a composable: the one-time arming of the session, the page's handlers and the
 * replay triggers (online, tab visible, and a mount with something queued). Client-only; on the
 * server the queue is empty and nothing arms.
 */
export function useQuickLogOutbox(role: TapRole, pageHandlers: OutboxHandlers = {}) {
  if (import.meta.client && !armed) {
    armed = true
    setOutboxSession(role, pageHandlers)
    useEventListener(window, 'online', flushPending)
    useEventListener(document, 'visibilitychange', () => {
      if (document.visibilityState === 'visible') flushPending()
    })
    flushPending()
  }
  return { pending }
}
