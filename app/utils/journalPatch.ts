import type { Ref } from 'vue'

/**
 * Mirrors one day of a journal write into the shared list store (audit #42 item 41: the soda
 * widget, the water widget, the food card and the home quick-log each carried this same loop).
 * REASSIGNS `data.value` rather than mutating a row in place — useAsyncData's shallow data ref
 * only notices a new array (shared/utils/mergePatch.ts and useListResource rule 4 both lean on
 * that). A day with no row yet gets one, kept in date order. Nothing happens before the list has
 * loaded: there is no store to mirror into, and the fetch that is coming will carry the write.
 */
export function patchJournalDay<T extends { date: string }>(data: Ref<T[] | null | undefined>, date: string, patch: Partial<T>): void {
  const list = data.value
  if (!list) return
  const idx = list.findIndex(e => e.date === date)
  data.value = idx >= 0
    ? list.map((e, i) => (i === idx ? { ...e, ...patch } : e))
    : [...list, { date, ...patch } as T].sort((a, b) => a.date.localeCompare(b.date))
}
