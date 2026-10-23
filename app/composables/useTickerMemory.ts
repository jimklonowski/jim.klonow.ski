import type { Role } from '#shared/utils/access'
import type { TickerStateResponse } from '#shared/types/ticker'
import { mergePatch } from '#shared/utils/mergePatch'

/**
 * Where the pet keeps what it remembers. The owner's TICKER remembers in the database (migration
 * 0009, /api/ticker/state), so it is the same pet on the phone and the desktop. The demo sandbox
 * is shared by every demo visitor, so its pet keeps its memory in the browser, as it always did.
 * A guest holds no memory of their own: they leave footprints, pets and runs through their own
 * endpoints, and the owner's pet mentions them on its next look.
 */
export async function useTickerMemory(role: Ref<Role | null>) {
  /** Whose pet it is: the keeper gets the reactions, the news and the stamps; a guest gets a hello. */
  const keeper = role.value === 'owner' || role.value === 'demo'
  /** Memory on the server (owner and guests) or in this browser (demo). */
  const remote = role.value != null && role.value !== 'demo'
  const requestFetch = useRequestFetch()

  // Browser memory is read only once mounted. During hydration the setup-time reads returned the
  // stored values while the server had rendered the defaults, so the demo pet hydrated with a PETS
  // tile, a FEED count and a HI that didn't match its markup. Registered here, BEFORE the await
  // below (a hook registered after an await inside a composable has no component instance to
  // attach to) and before the page's hooks that re-read each setup-time recall(), so it flips first.
  let hydrated = false
  onMounted(() => {
    hydrated = true
  })

  const { data: memoryData } = remote
    ? await useAsyncData('ticker-state', () => requestFetch<TickerStateResponse>('/api/ticker/state'), {
        getCachedData: (key, app, ctx) => ctx.cause === 'initial' ? app.payload.data[key] : undefined
      })
    : { data: ref<TickerStateResponse | null>(null) }
  const memory = reactive<Record<string, unknown>>({ ...(memoryData.value?.state ?? {}) })
  const visits = computed(() => memoryData.value?.visits ?? null)
  const visitorLabel = computed(() => memoryData.value?.me.label ?? null)

  /** What it remembers under a key: the server's copy, or the browser's for the demo pet. */
  function recall<T>(key: string): T | null {
    if (remote) return (memory[key] as T | undefined) ?? null
    if (import.meta.server || !hydrated) return null
    try {
      const raw = localStorage.getItem(`ticker:${key}`)
      if (raw == null) return null
      try {
        return JSON.parse(raw) as T
      }
      catch {
        return raw as unknown as T // a plain stamp from before the memory was JSON
      }
    }
    catch {
      return null
    }
  }

  /**
   * Remember something: the server for the owner, the browser for the demo pet, nowhere for a
   * guest. `merge` folds an object into what is stored (json_patch on the server, the same rule on
   * the mirror here) instead of replacing it, so a fed check made on the phone and one made on the
   * desktop both survive — whole-object writes were last-writer-wins across devices.
   */
  function remember(key: string, value: unknown, merge = false) {
    const next = merge ? mergePatch(remote ? memory[key] : recall(key), value) : value
    memory[key] = next
    if (remote) {
      if (role.value === 'owner') $fetch('/api/ticker/state', { method: 'POST', body: { key, value, merge } }).catch(() => { /* it'll remember next time */ })
    }
    else {
      try {
        localStorage.setItem(`ticker:${key}`, JSON.stringify(next))
      }
      catch { /* a private window — the demo pet forgets on close, which is fine */ }
    }
  }

  return { keeper, remote, memory, visits, visitorLabel, recall, remember }
}
