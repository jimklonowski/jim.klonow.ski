import type { CyclePlanItem } from '#shared/utils/cycles'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UNITS = new Set(['mg', 'mcg', 'iu'])

// The plan drives adherence scoring, calendar rings, and AI prompt context, so a malformed
// item would quietly poison all three — validate the whole shape and 400 loudly instead.
function parseItems(raw: unknown, weeks: number): CyclePlanItem[] {
  if (!Array.isArray(raw) || !raw.length) {
    throw createError({ statusCode: 400, message: 'A cycle needs at least one compound' })
  }
  return raw.map((item: Record<string, unknown>) => {
    const compound = typeof item.compound === 'string' ? item.compound.trim() : ''
    const dose = Number(item.dose)
    const unit = item.unit as string
    const weekdays = Array.isArray(item.weekdays)
      ? [...new Set(item.weekdays.map(Number))].filter(d => Number.isInteger(d) && d >= 0 && d <= 6).sort()
      : []
    const fromWeek = Number(item.fromWeek ?? 1)
    const toWeek = item.toWeek == null || item.toWeek === '' ? null : Number(item.toWeek)

    if (!compound) throw createError({ statusCode: 400, message: 'Compound name missing on a plan row' })
    if (!Number.isFinite(dose) || dose <= 0) throw createError({ statusCode: 400, message: `Bad dose for ${compound}` })
    if (!UNITS.has(unit)) throw createError({ statusCode: 400, message: `Bad unit for ${compound}` })
    if (!weekdays.length) throw createError({ statusCode: 400, message: `No scheduled days for ${compound}` })
    if (!Number.isInteger(fromWeek) || fromWeek < 1 || fromWeek > weeks) {
      throw createError({ statusCode: 400, message: `Start week out of range for ${compound}` })
    }
    if (toWeek != null && (!Number.isInteger(toWeek) || toWeek < fromWeek || toWeek > weeks)) {
      throw createError({ statusCode: 400, message: `End week out of range for ${compound}` })
    }
    return { compound, dose, unit: unit as CyclePlanItem['unit'], weekdays, fromWeek, toWeek }
  })
}

// Insert a new cycle (no id) or update an existing one (id present). Ending a cycle early —
// or extending it — is just an update that sets actual_end; status stays derived from dates.
export default defineEventHandler(async (event) => {
  requireOwner(event)

  const body = await readBody<Record<string, unknown>>(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) throw createError({ statusCode: 400, message: 'Missing name field' })

  const startDate = body.start_date as string
  if (!DATE_RE.test(startDate ?? '')) throw createError({ statusCode: 400, message: 'Bad start_date' })

  const weeks = Number(body.planned_weeks)
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) {
    throw createError({ statusCode: 400, message: 'planned_weeks must be 1-52' })
  }

  const actualEnd = body.actual_end == null || body.actual_end === '' ? null : body.actual_end as string
  if (actualEnd != null && (!DATE_RE.test(actualEnd) || actualEnd < startDate)) {
    throw createError({ statusCode: 400, message: 'Bad actual_end' })
  }

  const compounds = JSON.stringify(parseItems(body.compounds, weeks))
  const goal = (typeof body.goal === 'string' && body.goal.trim()) || null
  const notes = (typeof body.notes === 'string' && body.notes.trim()) || null

  const db = getDb(event)

  if (body.id != null) {
    await db.prepare(`
      UPDATE cycles SET
        name = ?2, goal = ?3, start_date = ?4, planned_weeks = ?5, actual_end = ?6,
        compounds = ?7, notes = ?8
      WHERE id = ?1
    `).bind(body.id, name, goal, startDate, weeks, actualEnd, compounds, notes).run()
    return { ok: true, id: body.id }
  }

  const result = await db.prepare(`
    INSERT INTO cycles (name, goal, start_date, planned_weeks, actual_end, compounds, notes, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
  `).bind(name, goal, startDate, weeks, actualEnd, compounds, notes, new Date().toISOString()).run()

  return { ok: true, id: result.meta.last_row_id }
})
