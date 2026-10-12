import { zTickerStateSave } from '#shared/utils/schemas'

// One key of the pet's memory. Owner only: a guest holds no memory of their own (footprints and
// pets go through their own endpoints), and the demo pet remembers in the browser. Not audited —
// these are the pet's own notes, not the owner's data. `merge` folds an object into the stored
// one (json_patch) so two devices' writes to the same key both survive.
export default defineEventHandler(async (event) => {
  requireOwner(event)
  const { key, value, merge } = await readValidatedJson(event, zTickerStateSave)
  if (merge) await mergeTickerState(event, key, value as Record<string, unknown>)
  else await writeTickerState(event, key, value)
  return { ok: true }
})
