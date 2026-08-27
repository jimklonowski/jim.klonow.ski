import type { Role } from '#shared/utils/access'

// Client-visible auth state (the session cookie is httpOnly). Used for UI gating only — hiding
// write controls from guests, the doctor's trimmed journal view, the header logout button.
// Enforcement lives server-side in the API handlers and server/middleware/auth.ts.
export async function useAuth() {
  const requestFetch = useRequestFetch()
  const { data, refresh } = await useAsyncData(
    'auth-me',
    () => requestFetch<{ role: Role | null }>('/api/auth/me'),
    { getCachedData: (key, nuxtApp) => nuxtApp.payload.data[key] ?? nuxtApp.static.data[key] }
  )
  const role = computed<Role | null>(() => data.value?.role ?? null)
  const isOwner = computed(() => role.value === 'owner')
  // Write affordances (journal days, sodas, supplements, vials) — demo edits land in the
  // sandbox DB. Owner-only capabilities (uploads, AI, sharing, Whoop) keep gating on isOwner.
  const canEdit = computed(() => role.value === 'owner' || role.value === 'demo')
  return { role, isOwner, canEdit, refresh }
}
