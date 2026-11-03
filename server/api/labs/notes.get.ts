import { eventBands } from '#shared/utils/protocolEvents'
import { EMPTY_LAB_NOTES, type LabNotes } from '#shared/utils/labNotes'
import { PROTOCOL_EVENTS } from '../../data/protocolEvents'
import { MARKER_CAVEATS } from '../../data/markerCaveats'

// The owner's hand-written lab context the client may see (audit #43 item 48): the dated events
// as chart bands — {from, to, label}, never the note — and the medication caveats the marker
// cards star. Any signed-in role; the demo sandbox's made-up history has none of it. Each draw's
// own assay notes travel on the draw instead (/api/labs/list).
export default defineEventHandler((event): LabNotes => {
  const auth = requireLabsAuth(event)
  if (auth.role === 'demo') return withEtag(event, EMPTY_LAB_NOTES)
  return withEtag(event, { events: eventBands(PROTOCOL_EVENTS), caveats: MARKER_CAVEATS })
})
