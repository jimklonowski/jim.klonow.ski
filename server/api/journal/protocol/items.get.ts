import type { ProtocolItemRow, ProtocolVersionRow } from '#shared/utils/protocolStore'
import { readProtocolRows } from '../../../utils/protocolLoader'

export interface ProtocolRowsPayload {
  items: ProtocolItemRow[]
  versions: ProtocolVersionRow[]
}

// The protocol tables as rows, for the /journal/protocol page (which edits them by id). Readable
// by every authenticated role like the mapped list; the demo sandbox sees its own rows, and a
// database before migration 0013 reads as empty — the page then says so.
export default defineEventHandler(async (event): Promise<ProtocolRowsPayload> => {
  requireLabsAuth(event)
  const rows = await readProtocolRows(getDb(event))
  return withEtag(event, { items: rows?.items ?? [], versions: rows?.versions ?? [] })
})
