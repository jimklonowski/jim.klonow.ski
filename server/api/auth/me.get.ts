// Client-visible auth state (the cookie is httpOnly). Returns { role: null } rather than 401
// so the header/composables can probe it without error handling.
export default defineEventHandler((event) => {
  const auth = getAuth(event)
  return { role: auth?.role ?? null }
})
