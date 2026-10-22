// A guest opened /ticker: leave today's footprint (once a day per share link; a reload is not a
// new visit). The owner's TICKER mentions new footprints on its next look.
export default defineEventHandler(async (event) => {
  // The roles that may open /ticker (access.ts), and of those only a share-link guest leaves a
  // footprint — the owner is home, and the demo pet lives in the browser.
  const auth = requireTickerAccess(event)
  if (!auth.inviteId) throw createError({ statusCode: 403, message: 'Visits are a guest\'s footprint' })
  return { ok: await touchVisit(event, auth) }
})
