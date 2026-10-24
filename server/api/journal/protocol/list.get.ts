import type { LoadedProtocol } from '#shared/utils/protocolStore'
import { protocolFor, publicProtocol } from '../../../utils/protocolLoader'

// The standing schedule as the server resolves it — the protocol tables, or the code constants
// until they are seeded (server/utils/protocolLoader.ts). Readable by every authenticated role:
// the schedule is protocol context, the same policy as the supplement stack and the cycles list.
// publicProtocol says what the demo sandbox is told.
export default defineEventHandler(async (event): Promise<LoadedProtocol> => {
  const auth = requireLabsAuth(event)
  return withEtag(event, publicProtocol(await protocolFor(event), auth.role))
})
