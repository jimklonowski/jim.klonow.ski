export default defineEventHandler((event) => {
  requireUploadPin(event)
  return { ok: true }
})
