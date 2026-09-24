// Readable by every authenticated role: the standing supplement stack is protocol context
// (the kind of thing a doctor viewer should see), unlike the owner-only vial inventory.
export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  return withEtag(event, await listRows(event, 'SELECT * FROM supplements ORDER BY sort ASC, name ASC'))
})
