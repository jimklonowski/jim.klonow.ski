import type { TickerStateResponse } from '#shared/types/ticker'

// The /ticker pet's memory and the visitors' footprints, in one read. Every authenticated role
// but demo: the sandbox pet keeps its memory in the browser (see migration 0009). The owner gets
// everything; a guest gets the house figures only — the pet counter and the records — never the
// owner's reaction stamps or another guest's name.
export default defineEventHandler(async (event): Promise<TickerStateResponse> => {
  const auth = requireLabsAuth(event)
  if (auth.role === 'demo') throw createError({ statusCode: 403, message: 'The demo pet remembers in the browser' })

  const [state, visits] = await Promise.all([readTickerState(event), readVisits(event)])
  if (auth.role === 'owner') return withEtag(event, { state, visits, me: { role: auth.role, label: null } })

  return withEtag(event, {
    state: { pets: state.pets, runner: state.runner },
    visits: { total: visits.total, pets: visits.pets, recent: [], best: visits.best },
    me: { role: auth.role, label: await guestLabel(event, auth) }
  })
})
