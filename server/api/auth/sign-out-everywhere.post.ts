// Signs out every other owner session (and every upload-PIN unlock) on every device, keeping
// this one signed in with a fresh token. For a lost or shared device; see server/utils/auth.ts.
export default defineEventHandler(async (event) => {
  requireOwner(event)
  await signOutEverywhereElse(event)
  return { ok: true }
})
