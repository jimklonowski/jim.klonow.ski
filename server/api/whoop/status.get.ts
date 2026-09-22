// Connection state for the journal header's Whoop control: connected, when it last synced
// cleanly, and why it stopped if it did. `connected` alone used to be the whole answer, which
// meant a rejected refresh token still read as a green check.
export default defineEventHandler(async (event) => {
  requireOwner(event)

  return getWhoopStatus(getDb(event))
})
