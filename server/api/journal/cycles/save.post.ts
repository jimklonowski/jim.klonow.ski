import type { CyclePlanItem } from '#shared/utils/cycles'
import { startAnchor } from '#shared/utils/cycles'
import { zCycleSave } from '#shared/utils/schemas'
import { DOSE_UNIT_VALUES } from '#shared/types/journal'

const UNITS = new Set<string>(DOSE_UNIT_VALUES)

// The plan drives adherence scoring, calendar rings, and AI prompt context, so a malformed
// item would quietly poison all three — validate the whole shape and 400 loudly instead.
function parseItems(raw: Record<string, unknown>[], weeks: number): CyclePlanItem[] {
  return raw.map((item) => {
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

  // zCycleSave types and bounds every field; the checks below are the cross-field ones.
  const body = await readValidatedJson(event, zCycleSave)
  const { name, start_precision: precision, planned_weeks: weeks, planned_days: days, actual_end: actualEnd, goal, notes } = body

  // Re-derive rather than trust: a month/quarter start is stored only as its anchor, so a
  // stray day-of-month can't survive to be read back as a commitment.
  const startDate = startAnchor(body.start_date, precision)

  // A day-exact span for plans that are not whole weeks. Null keeps the old meaning (weeks × 7).
  // It must fit inside the week count it was derived from, so week-relative item windows can
  // never point past the end of the cycle.
  if (days != null && days > weeks * 7) {
    throw createError({ statusCode: 400, message: `planned_days must be 1-${weeks * 7}` })
  }

  if (actualEnd != null && actualEnd < startDate) {
    throw createError({ statusCode: 400, message: 'Bad actual_end' })
  }
  // A cycle with no committed start can't have ended: it never began, and cycleStatusOn keeps
  // it 'upcoming' regardless, so an actual_end here would be silently inert.
  if (actualEnd != null && precision !== 'day') {
    throw createError({ statusCode: 400, message: 'Set a start date before ending a cycle' })
  }

  const compounds = JSON.stringify(parseItems(body.compounds, weeks))

  const db = getDb(event)

  if (body.id != null) {
    const before = await auditBefore(event, 'cycles', body.id)
    await db.prepare(`
      UPDATE cycles SET
        name = ?2, goal = ?3, start_date = ?4, start_precision = ?5, planned_weeks = ?6,
        planned_days = ?7, actual_end = ?8, compounds = ?9, notes = ?10
      WHERE id = ?1
    `).bind(body.id, name, goal, startDate, precision, weeks, days, actualEnd, compounds, notes).run()
    await recordAudit(event, { table: 'cycles', key: body.id, before, summary: name })
    return { ok: true, id: body.id }
  }

  const result = await db.prepare(`
    INSERT INTO cycles (name, goal, start_date, start_precision, planned_weeks, planned_days, actual_end, compounds, notes, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
  `).bind(name, goal, startDate, precision, weeks, days, actualEnd, compounds, notes, new Date().toISOString()).run()
  await recordAudit(event, { table: 'cycles', key: result.meta.last_row_id, before: null, summary: name })

  return { ok: true, id: result.meta.last_row_id }
})
