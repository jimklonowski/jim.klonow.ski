import { zDrinkLabelDelete } from '#shared/utils/schemas'
import { drinkKey } from '#shared/utils/drinks'

// Drop the owner's label for a drink: its figures fall back to the built-in table. The audit log
// keeps the row (auditedDelete makes the delete and its entry one transaction).
export default defineEventHandler(async (event) => {
  requireWriteAccess(event)
  const { name } = await readValidatedJson(event, zDrinkLabelDelete)
  await auditedDelete(event, 'drink_labels', drinkKey(name), before => `label for ${before.name}`)
  return { ok: true }
})
