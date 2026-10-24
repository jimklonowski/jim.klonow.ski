import type { ProtocolItemRow, ProtocolVersionRow } from '#shared/utils/protocolStore'

export interface ProtocolRows {
  items: ProtocolItemRow[]
  versions: ProtocolVersionRow[]
}

/** The protocol tables as rows, for the page that edits them (/journal/protocol). The mapped
 * schedule the rings and prompts read is useProtocol(); a write here refreshes both. */
export function useProtocolItems() {
  return useListResource<ProtocolRows>('/journal/protocol/items', '/api/journal/protocol/items', { label: 'protocol items' })
}
