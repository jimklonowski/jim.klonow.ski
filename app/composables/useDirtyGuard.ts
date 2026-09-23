// Unsaved-changes protection for the long forms: the day entry and the modal editors (cycle
// plan, stock, supplements, shots). Until this, closing a half-filled modal or following a
// link off the day page threw the typing away with no warning.
//
// Dirty means "differs from the last clean snapshot", compared as JSON, so typing a value and
// deleting it again reads as clean. Call markClean() whenever the form is (re)loaded or saved.
//
//   const guard = useDirtyGuard(() => form)
//   const modalOpen = guard.guardOpen(formModalOpen)  // bind UModal v-model:open to this
//   function openEdit(row) { Object.assign(form, row); guard.markClean(); formModalOpen.value = true }
//
// While dirty, it also asks before an in-app navigation and before the tab closes or reloads.
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'

const DISCARD_PROMPT = 'You have unsaved changes. Discard them?'

export function useDirtyGuard(source: () => unknown) {
  const snapshot = ref(JSON.stringify(source()))
  const isDirty = computed(() => JSON.stringify(source()) !== snapshot.value)

  // Snapshots now and again after the next tick: loading a form can trip its own watchers
  // (the cycle form re-anchors start_date when the precision changes), and that normalization
  // must count as part of the load, not as an edit.
  function markClean() {
    snapshot.value = JSON.stringify(source())
    nextTick(() => {
      snapshot.value = JSON.stringify(source())
    })
  }

  /** True when it's fine to throw the edits away: nothing changed, or the user said so. */
  function confirmDiscard(): boolean {
    if (!isDirty.value) return true
    if (!window.confirm(DISCARD_PROMPT)) return false
    markClean()
    return true
  }

  /**
   * A modal's open state that asks before closing over unsaved edits: Escape, the backdrop, and
   * the close button all go through this setter. Opening is never blocked.
   */
  function guardOpen(open: Ref<boolean>) {
    return computed({
      get: () => open.value,
      set: (v: boolean) => {
        if (!v && !confirmDiscard()) return
        open.value = v
      }
    })
  }

  if (import.meta.client && getCurrentInstance()) {
    onBeforeRouteLeave(() => confirmDiscard())
    // The day page's prev/next links only change a param. The router calls that an update, not
    // a leave. A query-only change (a tab, a filter) keeps the form, so it isn't asked about.
    onBeforeRouteUpdate((to, from) => to.path === from.path || confirmDiscard())
    useEventListener(window, 'beforeunload', (e: BeforeUnloadEvent) => {
      if (!isDirty.value) return
      // Browsers show their own generic wording; preventDefault is what triggers the prompt.
      e.preventDefault()
    })
  }

  return { isDirty, markClean, confirmDiscard, guardOpen }
}
