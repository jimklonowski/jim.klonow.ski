// One factory for the list stores (journal, labs, cycles, vials, …). Every page reads them
// through useAsyncData under a shared key, so a list fetched on one page is already in the
// payload cache when the next page asks for it. Two rules decide when to use that cache:
//
// 1. Serve the cache only on the INITIAL call. Nuxt 4 consults getCachedData on refresh() too
//    (granularCachedData), so an unconditional cache made refresh() after a save a no-op.
//
// 2. Stale-while-revalidate on client-side navigation. A cache hit renders the list at once, and
//    one background refresh after mount picks up anything another page changed. Mounts that
//    land together share that refresh, and a key fetched in the last two seconds is left alone.
//    After a hard load the SSR payload is already fresh, so hydration does NOT refetch.
//
// Before this, seven composables copied rule 1 and never revalidated, so pages each added their
// own onMounted(refresh). About 25 of those fired even right after SSR, a second request for
// data the server had just sent. The other four had no cache at all, so every navigation
// blocked on a refetch.
//
// `error` and `status` come straight from useAsyncData. Pages render the error, and the status
// is there for pages that want a loading state.
//
// 3. A failed refresh keeps what's on screen. useAsyncData resets `data` to its default when a
//    fetch fails, so one dropped background revalidate blanked a list that was fine a second
//    earlier (or flipped the page to its TuiDataState error panel). When the browser already
//    holds content for the key, the fetcher returns that instead and raises a toast saying the
//    list couldn't refresh. A failed FIRST load still throws, and the page's error panel shows it.
//
// 4. A local write during a fetch is not overwritten by it. The quick-log widgets assign
//    `data.value` straight after their POST; a mount-time revalidation already in flight then
//    resolved with the list as it was BEFORE the tap and put that on screen — the soda or pour
//    was saved, but vanished until the next refresh (audit #42 item 23). Every assignment that
//    isn't the fetcher's own is stamped; a response requested before the latest stamp is stale,
//    so the fetcher hands back what's on screen and fetches once more for the server's truth.

interface ListResourceOptions<Raw, T> {
  /** Reshape the response once, before it's cached (e.g. the labs list's derived markers). */
  transform?: (raw: Raw) => T
  /** Fetch only on execute(): for data behind a click, like the digest panel. */
  lazy?: boolean
  /** What the list is, for the "couldn't refresh" toast ("journal entries"). Defaults to the key. */
  label?: string
}

// Every list that failed to refresh in the last few seconds shares one toast, so going offline
// (every mounted list failing together) reads as one message, not a stack of five.
const REFRESH_TOAST_ID = 'list-refresh-failed'
const REFRESH_TOAST_WINDOW_MS = 15_000
const failedRecently = new Map<string, number>()

function refreshFailedToast(toast: ReturnType<typeof useToast>, label: string, err: unknown) {
  const now = Date.now()
  for (const [l, at] of failedRecently) if (now - at > REFRESH_TOAST_WINDOW_MS) failedRecently.delete(l)
  failedRecently.set(label, now)
  const labels = [...failedRecently.keys()]
  const status = (err as { statusCode?: number, status?: number } | null)?.statusCode
    ?? (err as { status?: number } | null)?.status
  toast.add({
    id: REFRESH_TOAST_ID,
    title: `Couldn't refresh ${labels.join(', ')}`,
    description: `Showing what was already loaded${status ? ` (the server answered ${status})` : ' (no response — offline?)'}. It retries on the next page change.`,
    color: 'warning',
    icon: 'i-lucide-cloud-off'
  })
}

// When each key last started a fetch in this browser tab. A mount revalidates unless the key
// fetched a moment ago: several components mounting on one navigation (a page plus the header
// menu, or the outgoing and incoming pages) share one request. Client-only, since a
// module-level Map on the server would be shared across users' requests.
const lastFetchStarted = new Map<string, number>()
const JUST_FETCHED_MS = 2000

// Rule 4: when each key's `data` was last assigned by something other than the fetcher (a
// widget's local patch after a write). Client-only, like lastFetchStarted.
const lastPatchedAt = new Map<string, number>()

/** Whether a cached value is worth serving. An empty list or object reads as a miss and refetches. */
function hasContent(value: unknown): boolean {
  if (value == null) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

export function useListResource<T, Raw = T>(key: string, url: string, options: ListResourceOptions<Raw, T> = {}) {
  const requestFetch = useRequestFetch()
  const nuxtApp = useNuxtApp()
  const { transform, lazy = false, label = key } = options
  // Taken in setup: the fetcher below runs later, outside the component's injection context.
  const toast = useToast()
  // Created while hydrating a hard load: the SSR payload was fetched for this very render.
  const fromSsr = import.meta.client && nuxtApp.isHydrating

  // The value the fetcher last handed to useAsyncData: any other value seen in `data` is a
  // local patch (rule 4).
  let lastFetched: T | undefined

  const result = useAsyncData<T>(
    key,
    async () => {
      const startedAt = Date.now()
      if (import.meta.client) lastFetchStarted.set(key, startedAt)
      try {
        // Nuxt 4.6's route-typed fetch can't prove its result assignable to an unconstrained
        // generic, so the cast goes on the result rather than the call.
        const raw = await requestFetch(url) as Raw
        const value = transform ? transform(raw) : (raw as unknown as T)
        // Rule 4: a write landed while this request was out, so the response predates what's on
        // screen. Keep the screen, and ask again for the list that includes the write. The screen
        // is the live ref, not the payload: Nuxt writes the payload only when a fetch resolves,
        // so it never holds a widget's local patch.
        const current = live.data.value
        if (import.meta.client && (lastPatchedAt.get(key) ?? 0) > startedAt && hasContent(current)) {
          queueMicrotask(() => {
            result.refresh({ dedupe: 'cancel' })
          })
          lastFetched = current as T
          return current as T
        }
        lastFetched = value
        return value
      }
      catch (err) {
        // Rule 3: keep the last good value rather than let useAsyncData wipe it — what's on
        // screen (local patches included), else the payload's last successful result.
        const current = live.data.value ?? nuxtApp.payload.data[key]
        if (import.meta.client && hasContent(current)) {
          refreshFailedToast(toast, label, err)
          lastFetched = current as T
          return current as T
        }
        throw err
      }
      finally {
        // Stamped again on completion, so a slow blocking fetch isn't repeated by the mount
        // that follows it.
        if (import.meta.client) lastFetchStarted.set(key, Date.now())
      }
    },
    {
      immediate: !lazy,
      getCachedData: (k, app, ctx) => {
        if (ctx.cause !== 'initial') return undefined
        const cached = app.payload.data[k] ?? app.static.data[k]
        return hasContent(cached) ? cached as T : undefined
      }
    }
  )

  // The list as the page sees it right now, local patches included (rules 3 and 4 read it from
  // inside the fetcher, which only runs after this line).
  const live = useNuxtData<T>(key)

  // Rule 4's stamp: `data` set to anything but the fetcher's own result is a local patch. Sync
  // flush, so the stamp is taken at the assignment, before a response can be compared to it.
  if (import.meta.client) {
    watch(result.data, (v) => {
      if (v !== lastFetched) lastPatchedAt.set(key, Date.now())
    }, { flush: 'sync' })
  }

  // Revalidate on mount. This is deliberately not tied to whether getCachedData served the
  // data: when another mounted component already holds the key (the header menu, or the
  // outgoing page mid-transition), Nuxt reuses that store without asking the cache at all.
  if (import.meta.client && !lazy && !fromSsr && getCurrentInstance()) {
    onMounted(() => {
      const started = lastFetchStarted.get(key)
      if (started != null && Date.now() - started < JUST_FETCHED_MS) return
      // 'defer' joins a fetch already in flight instead of cancelling it.
      result.refresh({ dedupe: 'defer' })
    })
  }

  return result
}
