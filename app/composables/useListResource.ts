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

interface ListResourceOptions<Raw, T> {
  /** Reshape the response once, before it's cached (e.g. the labs list's derived markers). */
  transform?: (raw: Raw) => T
  /** Fetch only on execute(): for data behind a click, like the digest panel. */
  lazy?: boolean
}

// When each key last started a fetch in this browser tab. A mount revalidates unless the key
// fetched a moment ago: several components mounting on one navigation (a page plus the header
// menu, or the outgoing and incoming pages) share one request. Client-only, since a
// module-level Map on the server would be shared across users' requests.
const lastFetchStarted = new Map<string, number>()
const JUST_FETCHED_MS = 2000

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
  const { transform, lazy = false } = options
  // Created while hydrating a hard load: the SSR payload was fetched for this very render.
  const fromSsr = import.meta.client && nuxtApp.isHydrating

  const result = useAsyncData<T>(
    key,
    async () => {
      if (import.meta.client) lastFetchStarted.set(key, Date.now())
      try {
        const raw = await requestFetch<Raw>(url)
        return transform ? transform(raw) : (raw as unknown as T)
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
