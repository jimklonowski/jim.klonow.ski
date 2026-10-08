// A guest opened /ticker: leave today's footprint (once a day per share link; a reload is not a
// new visit). The owner's TICKER mentions new footprints on its next look.
export default defineEventHandler(async (event) => {
  const auth = requireRole(event, 'friend', 'doctor')
  return { ok: await touchVisit(event, auth) }
})
