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
  return { role, isOwner, refresh }
}
