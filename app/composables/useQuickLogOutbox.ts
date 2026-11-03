import type { SodaEntry, WaterEntry } from '#shared/types/journal'

// The quick-log outbox (audit #43 item 43). A soda or water tap made with no network used to
// fail with "Failed to log …" and was gone — and tapping again later recorded the wrong time,
// since a tap carries the clock of the moment it was made. Now a tap that gets NO ANSWER (the
// network is down, not a 4xx/5xx the server actually gave) is kept here with its own date, time
// and a client-made id, shown as logged with a pending mark, and sent again when the browser
// comes back online or the tab is next looked at. The id makes the replay safe: the first try
// may have landed without its answer arriving, and the endpoints skip a tap whose id the day
// already holds (shared/utils/journalRemove.ts appendTapSql).
//
// localStorage, not IndexedDB: the queue is a handful of small objects, read and written whole,
// and every write is wrapped — storage can be absent or throw in a private window, and a tap
// must still go to the server then. No service worker is involved: this is about keeping the
// tap, not about serving the app offline.

export type PendingTap
  = { id: string, kind: 'soda', date: string, time: string, drink?: string, size?: string }
    | { id: string, kind: 'water', date: string, time: string, oz: number }

const KEY = 'quicklog:outbox'

/** A fresh tap id: 'tap-' + 24 hex chars (zTapId: [a-z0-9-]{8,40}). */
export function newTapId(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return `tap-${[...bytes].map(b => b.toString(16).padStart(2, '0')).join('')}`
}

/**
 * True for a request that never got an answer: ofetch's FetchError with no `response` and no
 * status (the dead-network signature — `<no response> fetch failed`). A server's own refusal
 * (401, 400, 500) carries a status and must not be queued: it would fail the same way on replay.
 */
export function isNoResponse(err: unknown): boolean {
  const e = err as { response?: unknown, statusCode?: number, status?: number } | null
  return !!e && typeof e === 'object' && !e.response && e.statusCode == null && e.status == null
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

/** The queued taps, kept reactive for the widgets' pending marks. Client-only state. */
const pending = ref<PendingTap[]>([])
let armed = false
let flushing: Promise<void> | null = null

/** The soda taps queued for `date`, as entries the widget can list beside the saved ones. */
export function pendingSodas(date: string): SodaEntry[] {
  return pending.value.filter((t): t is Extract<PendingTap, { kind: 'soda' }> => t.kind === 'soda' && t.date === date)
    .map(t => ({ time: t.time, drink: t.drink, size: t.size, id: t.id }))
}

export function pendingWater(date: string): WaterEntry[] {
  return pending.value.filter((t): t is Extract<PendingTap, { kind: 'water' }> => t.kind === 'water' && t.date === date)
    .map(t => ({ time: t.time, oz: t.oz, id: t.id }))
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
  list.push(tap)
  writeQueue(list)
  const kept = readQueue().some(t => t.id === tap.id)
  if (kept) pending.value = readQueue()
  return kept
}

/**
 * Sends every queued tap, oldest first, stopping at the first that still gets no answer (the
 * network is still down — the rest would fail the same way). A tap the server refuses outright
 * (a status) is dropped with a toast: it will never succeed, and keeping it would retry forever.
 * One flush at a time; a second call joins the one in flight.
 */
export function flushOutbox(onLanded?: (tap: PendingTap, lists: { sodas?: SodaEntry[], water?: WaterEntry[] }) => void): Promise<void> {
  if (flushing) return flushing
  flushing = (async () => {
    const toast = useToast()
    let list = readQueue()
    while (list.length) {
      const tap = list[0]!
      try {
        const lists = await send(tap)
        list = readQueue().filter(t => t.id !== tap.id)
        writeQueue(list)
        pending.value = list
        onLanded?.(tap, lists)
      }
      catch (err) {
        if (isNoResponse(err)) break
        list = readQueue().filter(t => t.id !== tap.id)
        writeQueue(list)
        pending.value = list
        toast.add({ title: `A queued ${tap.kind} tap was refused`, description: `${tap.date} ${tap.time}: ${extractErrorMessage(err, 'the server said no')} — it was not logged.`, color: 'warning' })
      }
    }
  })().finally(() => {
    flushing = null
  })
  return flushing
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
 * The outbox as a composable: the reactive queue, and the one-time arming of the replay
 * triggers (online, tab visible, and a mount with something queued). Client-only; on the server
 * the queue is empty and nothing arms.
 */
export function useQuickLogOutbox(onLanded?: (tap: PendingTap, lists: { sodas?: SodaEntry[], water?: WaterEntry[] }) => void) {
  if (import.meta.client && !armed) {
    armed = true
    pending.value = readQueue()
    const replay = () => {
      if (readQueue().length) flushOutbox(onLanded)
    }
    useEventListener(window, 'online', replay)
    useEventListener(document, 'visibilitychange', () => {
      if (document.visibilityState === 'visible') replay()
    })
    replay()
  }
  return { pending, enqueueTap, flushOutbox: () => flushOutbox(onLanded), pendingSodas, pendingWater, isPendingId }
}
