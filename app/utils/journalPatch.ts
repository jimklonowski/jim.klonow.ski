import type { Ref } from 'vue'
import type { SodaEntry, WaterEntry } from '#shared/types/journal'
import type { PendingTap } from '~/composables/useQuickLogOutbox'

// The journal list as the page holds it is the server's list PLUS the taps the outbox has not
// delivered yet (audit #44 item 6). A tap kept while offline used to be written into the list
// once, by the widget that made it — and the next thing to assign a day's list from a server
// answer (the next tap that got through, an undo, a refresh of the whole list) wrote it back
// out. The pour was still queued, but the count dropped by one, so it got tapped again, and both
// landed. Now every such assignment passes through overlayTaps, here and in the list's own
// fetch (useJournalEntries), so a queued tap stays on screen until it lands or is discarded.
//
// The queue lives in the outbox module, which needs a browser; this file stays plain so the
// tests can load it, and is handed the queue through setPendingTapSource when the outbox arms.

let pendingTaps: () => readonly PendingTap[] = () => []

/** The outbox's queue, as a getter: called on every overlay, so it always reads the queue as it is. */
export function setPendingTapSource(source: () => readonly PendingTap[]): void {
  pendingTaps = source
}

interface DayLists {
  date: string
  sodas?: SodaEntry[] | null
  water?: WaterEntry[] | null
}

/**
 * `list` with each of `taps` shown on its day, after the entries the server sent — a tap whose
 * id the day already holds (it landed, the answer was what got lost) is not shown twice. A day
 * with no row yet gets one, in date order. The same array comes back when there is nothing to
 * add, so an overlay with an empty queue changes nothing.
 */
export function overlayTaps<T extends DayLists>(list: T[], taps: readonly PendingTap[]): T[] {
  let out = list
  for (const tap of taps) {
    const key = tap.kind === 'soda' ? 'sodas' : 'water'
    const idx = out.findIndex(e => e.date === tap.date)
    const held = ((idx >= 0 ? out[idx]![key] : null) ?? []) as Array<{ id?: string }>
    if (held.some(e => e.id === tap.id)) continue
    const entry = tap.kind === 'soda'
      ? { time: tap.time, drink: tap.drink, size: tap.size, id: tap.id }
      : { time: tap.time, oz: tap.oz, id: tap.id }
    const day = { ...(idx >= 0 ? out[idx]! : { date: tap.date }), [key]: [...held, entry] } as T
    out = idx >= 0
      ? out.map((e, i) => (i === idx ? day : e))
      : [...out, day].sort((a, b) => a.date.localeCompare(b.date))
  }
  return out
}

/** A freshly fetched journal list with the queued taps on it (the list resource's transform). */
export function withPendingTaps<T extends DayLists>(list: T[]): T[] {
  return overlayTaps(list, pendingTaps())
}

/**
 * Mirrors one day of a journal write into the shared list store (audit #42 item 41: the soda
 * widget, the water widget, the food card and the home quick-log each carried this same loop).
 * REASSIGNS `data.value` rather than mutating a row in place — useAsyncData's shallow data ref
 * only notices a new array (shared/utils/mergePatch.ts and useListResource rule 4 both lean on
 * that). A day with no row yet gets one, kept in date order. Nothing happens before the list has
 * loaded: there is no store to mirror into, and the fetch that is coming will carry the write.
 *
 * The patch is usually a list the server just sent back; the taps still queued go on after it.
 */
export function patchJournalDay<T extends { date: string }>(data: Ref<T[] | null | undefined>, date: string, patch: Partial<T>): void {
  const list = data.value
  if (!list) return
  const idx = list.findIndex(e => e.date === date)
  const next = idx >= 0
    ? list.map((e, i) => (i === idx ? { ...e, ...patch } : e))
    : [...list, { date, ...patch } as T].sort((a, b) => a.date.localeCompare(b.date))
  data.value = withPendingTaps(next as unknown as DayLists[]) as unknown as T[]
}
