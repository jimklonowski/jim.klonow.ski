// Open (reconstitute) one vial from a sealed batch: decrement the batch quantity by one and
// spawn a new active vial (quantity 1) carrying over the batch's compound/supplier/size, with
// opened_date + bac_water_ml recorded. Runs as a D1 batch so both writes land together.
export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  const body = await readBody<Record<string, unknown>>(event)
  if (body?.id == null) {
    throw createError({ statusCode: 400, message: 'Missing vial id' })
  }
  const openedDate = (body.opened_date as string) || new Date().toISOString().slice(0, 10)
  const bacWaterMl = (body.bac_water_ml as number | null) ?? null

  const db = getDb(event)
  const row = await db.prepare('SELECT * FROM vials WHERE id = ?1').bind(body.id).first()
  if (!row) {
    throw createError({ statusCode: 404, message: 'Vial not found' })
  }
  if (row.status !== 'sealed') {
    throw createError({ statusCode: 400, message: 'Only sealed vials can be opened' })
  }
  const remainingQty = ((row.quantity as number | null) ?? 1) - 1

  const batchStatement = remainingQty > 0
    ? db.prepare('UPDATE vials SET quantity = ?2 WHERE id = ?1').bind(body.id, remainingQty)
    : db.prepare('DELETE FROM vials WHERE id = ?1').bind(body.id)

  const insertActive = db.prepare(`
    INSERT INTO vials
      (compound, supplier, vial_amount, vial_unit, quantity, status, opened_date, bac_water_ml, lot, expiry, cost, notes, created_at)
    VALUES (?1, ?2, ?3, ?4, 1, 'active', ?5, ?6, ?7, ?8, ?9, ?10, ?11)
  `).bind(
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
    new Date().toISOString()
  )

  await db.batch([batchStatement, insertActive])

  return { ok: true }
})
