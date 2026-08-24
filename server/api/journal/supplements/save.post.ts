// Insert a new supplement (no id) or update an existing one (id present). Discontinuing is
// just an update that sets `stopped` — rows are kept so recent stops remain AI context.
export default defineEventHandler(async (event) => {
  requireOwner(event)

  const body = await readBody<Record<string, unknown>>(event)
  if (!body?.name || typeof body.name !== 'string' || !body.name.trim()) {
    throw createError({ statusCode: 400, message: 'Missing name field' })
  }

  const db = getDb(event)

  const status = ['active', 'on_hand', 'stopped'].includes(body.status as string) ? body.status as string : 'active'
  const fields = {
    name: body.name.trim(),
    dose: body.dose || null,
    category: body.category === 'skin' ? 'skin' : 'supplement',
    status,
    schedule: (typeof body.schedule === 'string' && body.schedule.trim()) || 'daily',
    started: body.started || null,
    // A stopped date only makes sense on a stopped row — clear it on reactivate.
    stopped: status === 'stopped' ? (body.stopped || null) : null,
    notes: body.notes || null,
    sort: typeof body.sort === 'number' ? body.sort : 100
  }

  if (body.id != null) {
    await db.prepare(`
      UPDATE supplements SET
        name = ?2, dose = ?3, category = ?4, status = ?5, schedule = ?6, started = ?7,
        stopped = ?8, notes = ?9, sort = ?10
      WHERE id = ?1
    `).bind(
      body.id, fields.name, fields.dose, fields.category, fields.status, fields.schedule,
      fields.started, fields.stopped, fields.notes, fields.sort
    ).run()
    return { ok: true, id: body.id }
  }

  const result = await db.prepare(`
    INSERT INTO supplements (name, dose, category, status, schedule, started, stopped, notes, sort, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
  `).bind(
    fields.name, fields.dose, fields.category, fields.status, fields.schedule, fields.started,
    fields.stopped, fields.notes, fields.sort, new Date().toISOString()
  ).run()

  return { ok: true, id: result.meta.last_row_id }
})
