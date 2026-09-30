import { normalizeForm, isPillForm } from '#shared/utils/vialForm'
import { zVialOpen } from '#shared/utils/schemas'
import { localToday } from '#shared/utils/time'

// Open one container from a sealed batch: decrement the batch quantity by one and spawn a new
// active row (quantity 1) carrying over the batch's compound/supplier/size/form, with
// opened_date recorded — plus bac_water_ml when it's a vial being reconstituted (a pill bottle
// just gets started, so BAC water is dropped). Runs as a D1 batch so both writes land together.
export default defineEventHandler(async (event) => {
  requireWriteAccess(event)

  const body = await readValidatedJson(event, zVialOpen)
  const openedDate = body.opened_date ?? localToday()

  const db = getDb(event)
  const row = await db.prepare('SELECT * FROM vials WHERE id = ?1').bind(body.id).first()
  if (!row) {
    throw createError({ statusCode: 404, message: 'Vial not found' })
  }
  if (row.status !== 'sealed') {
    throw createError({ statusCode: 400, message: 'Only sealed vials can be opened' })
  }
  const form = normalizeForm(row.form)
  const bacWaterMl = isPillForm(form) ? null : body.bac_water_ml

  // Every statement re-checks the batch's live state instead of trusting the read above: two
  // opens racing on the same batch (two tabs, two devices) each computed `quantity - 1` from the
  // same read and spawned two actives while the batch dropped by one. The insert only fires
  // while a sealed unit still exists AT THAT MOMENT, the decrement is arithmetic in SQL, and the
  // delete collects a batch that just hit zero — one transaction, so the trio can't interleave.
  const stillSealed = 'SELECT 1 FROM vials WHERE id = ?1 AND status = \'sealed\' AND quantity >= 1'
  const insertActive = db.prepare(`
    INSERT INTO vials
      (compound, supplier, vial_amount, vial_unit, quantity, status, opened_date, bac_water_ml, lot, expiry, cost, notes, form, unit_count, created_at)
    SELECT ?2, ?3, ?4, ?5, 1, 'active', ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14
    WHERE EXISTS (${stillSealed})
  `).bind(
    body.id,
    row.compound,
    row.supplier ?? null,
    row.vial_amount,
    row.vial_unit || 'mg',
    openedDate,
    bacWaterMl,
    row.lot ?? null,
    row.expiry ?? null,
    row.cost ?? null,
    row.notes ?? null,
    form,
    (row.unit_count as number | null) ?? null,
    new Date().toISOString()
  )
  const decrement = db.prepare('UPDATE vials SET quantity = quantity - 1 WHERE id = ?1 AND status = \'sealed\' AND quantity >= 1').bind(body.id)
  const cleanup = db.prepare('DELETE FROM vials WHERE id = ?1 AND status = \'sealed\' AND quantity <= 0').bind(body.id)

  const [inserted, decremented, deleted] = await db.batch([insertActive, decrement, cleanup])
  if (!decremented?.meta.changes) {
    throw createError({ statusCode: 409, message: 'That batch was already emptied — refresh the list' })
  }

  // Two rows change: the sealed batch (decremented, or deleted when it was the last one) and the
  // new active vial. `row` was read above, so it doubles as the batch's before-image.
  const summary = `opened ${row.compound} ${row.vial_amount} ${row.vial_unit}`
  await recordAudit(event, { table: 'vials', key: body.id, before: row, deleted: !!deleted?.meta.changes, summary })
  if (inserted?.meta.last_row_id) {
    await recordAudit(event, { table: 'vials', key: inserted.meta.last_row_id, before: null, summary })
  }

  return { ok: true }
})
