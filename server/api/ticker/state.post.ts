import { zTickerStateSave } from '#shared/utils/schemas'

// One key of the pet's memory. Owner only: a guest holds no memory of their own (footprints and
// pets go through their own endpoints), and the demo pet remembers in the browser. Not audited —
// these are the pet's own notes, not the owner's data.
export default defineEventHandler(async (event) => {
  requireOwner(event)
  const { key, value } = await readValidatedJson(event, zTickerStateSave)
  await writeTickerState(event, key, value)
  return { ok: true }
})
