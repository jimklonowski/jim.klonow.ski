import { zIdOnly } from '#shared/utils/schemas'

// Hard delete — for abandoned drafts and mistakes. A cycle that actually ran should instead
// get actual_end set via save, so it survives as history for the dossier and the AI prompts.
// The delete and its audit entry are one transaction (auditedDelete), so /tools/data can always
// put it back.
export default defineEventHandler(async (event) => {
  requireOwner(event)

  const { id } = await readValidatedJson(event, zIdOnly)
  await auditedDelete(event, 'cycles', id, before => String(before.name))

  return { ok: true }
})
