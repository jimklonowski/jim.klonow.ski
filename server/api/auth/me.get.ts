// Client-visible auth state (the cookie is httpOnly). Returns { role: null } rather than 401
// so the header/composables can probe it without error handling.
//
// `uploadUnlocked` says whether the upload-PIN token is in force, so the upload page can render
// its gate — or not — in the SSR HTML instead of a gate that flipped after mount (audit #43 item
// 50). Owner only: nobody else can hold the PIN, so nobody else pays the token check.
export default defineEventHandler(async (event) => {
  const auth = getAuth(event)
  const role = auth?.role ?? null
  const uploadUnlocked = role === 'owner' ? await hasUploadPin(event) : false
  return { role, uploadUnlocked }
})
