import type { Role } from '#shared/utils/access'

interface Me {
  role: Role | null
  /** The upload-PIN token is in force (owner only) — the upload page's gate is drawn from this. */
  uploadUnlocked?: boolean
}

// Client-visible auth state (the session cookie is httpOnly). Used for UI gating only — hiding
// write controls from guests, the doctor's trimmed journal view, the header logout button.
// Enforcement lives server-side in the API handlers and server/middleware/auth.ts.
export async function useAuth() {
  const requestFetch = useRequestFetch()
  const { data, refresh } = await useAsyncData(
    'auth-me',
    () => requestFetch<Me>('/api/auth/me'),
    {
      // Serve the payload cache on the initial load only. Nuxt 4 consults getCachedData on
      // refresh() too, so returning the cache unconditionally made the exported refresh() a
      // no-op — nothing could pick up a role change without a full reload.
      getCachedData: (key, nuxtApp, ctx) =>
        ctx.cause === 'initial' ? (nuxtApp.payload.data[key] ?? nuxtApp.static.data[key]) : undefined
    }
  )
  const role = computed<Role | null>(() => data.value?.role ?? null)
  const isOwner = computed(() => role.value === 'owner')
  // Write affordances (journal days, sodas, water, supplements, vials) — demo edits land in the
  // sandbox DB. Owner-only capabilities (uploads, AI, sharing, Whoop) keep gating on isOwner.
  const canEdit = computed(() => role.value === 'owner' || role.value === 'demo')
  const uploadUnlocked = computed(() => data.value?.uploadUnlocked === true)
  return { role, isOwner, canEdit, uploadUnlocked, refresh }
}
