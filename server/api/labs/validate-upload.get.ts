export default defineEventHandler(async (event) => {
  await requireUploadPin(event)
  return { ok: true }
})
