// Insert a new vial (no id) or update an existing one (id present). Used for adding sealed
// stock, editing any vial, and status changes (e.g. marking an active vial finished).
export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  const body = await readBody<Record<string, unknown>>(event)
  if (!body?.compound || typeof body.compound !== 'string') {
    throw createError({ statusCode: 400, message: 'Missing compound field' })
  }
  if (body.vial_amount == null || typeof body.vial_amount !== 'number') {
    throw createError({ statusCode: 400, message: 'Missing vial_amount field' })
  }

  const db = getDb(event)

  const fields = {
    compound: body.compound,
    supplier: body.supplier || null,
    vial_amount: body.vial_amount,
    vial_unit: body.vial_unit || 'mg',
    quantity: body.quantity ?? 1,
    status: body.status || 'sealed',
    opened_date: body.opened_date || null,
    bac_water_ml: body.bac_water_ml ?? null,
    lot: body.lot || null,
    expiry: body.expiry || null,
    cost: body.cost ?? null,
    notes: body.notes || null
  }

  if (body.id != null) {
    await db.prepare(`
      UPDATE vials SET
        compound = ?2, supplier = ?3, vial_amount = ?4, vial_unit = ?5, quantity = ?6,
        status = ?7, opened_date = ?8, bac_water_ml = ?9, lot = ?10, expiry = ?11,
        cost = ?12, notes = ?13
      WHERE id = ?1
    `).bind(
      body.id, fields.compound, fields.supplier, fields.vial_amount, fields.vial_unit,
      fields.quantity, fields.status, fields.opened_date, fields.bac_water_ml, fields.lot,
      fields.expiry, fields.cost, fields.notes
    ).run()
    return { ok: true, id: body.id }
  }

  const result = await db.prepare(`
    INSERT INTO vials
      (compound, supplier, vial_amount, vial_unit, quantity, status, opened_date, bac_water_ml, lot, expiry, cost, notes, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
  `).bind(
    fields.compound, fields.supplier, fields.vial_amount, fields.vial_unit, fields.quantity,
    fields.status, fields.opened_date, fields.bac_water_ml, fields.lot, fields.expiry,
    fields.cost, fields.notes, new Date().toISOString()
  ).run()

  return { ok: true, id: result.meta.last_row_id }
})
