import { zIdOnly } from '#shared/utils/schemas'

// The delete and its audit entry are one transaction (auditedDelete). For the demo sandbox the
// audit statement is null (not audited), and the batch is the delete alone.
export default defineEventHandler(async (event) => {
  requireWriteAccess(event)

  const { id } = await readValidatedJson(event, zIdOnly)
  await auditedDelete(event, 'vials', id, before => `${before.compound} ${before.vial_amount} ${before.vial_unit}`)

  return { ok: true }
})
