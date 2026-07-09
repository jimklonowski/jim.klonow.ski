interface Vitals {
  weight_lbs?: number
  rhr?: number
  hrv?: number
  bp_systolic?: number
  bp_diastolic?: number
}

const VITAL_FIELDS = ['weight_lbs', 'rhr', 'hrv', 'bp_systolic', 'bp_diastolic'] as const

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization')
  const secret = process.env.LABS_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const body = await readBody(event)
  const metrics: Array<{ name: string, units?: string, data: Array<Record<string, unknown>> }> =
    body?.data?.metrics ?? []

  const byDate: Record<string, Vitals> = {}

  for (const metric of metrics) {
    const { name, units, data } = metric
    for (const point of data ?? []) {
      const dateStr = String(point.date ?? '').substring(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue
      if (!byDate[dateStr]) byDate[dateStr] = {}

      const qty = typeof point.qty === 'number' ? point.qty
        : typeof point.value === 'number' ? point.value : null

      if (name === 'body_mass' && qty != null) {
        byDate[dateStr].weight_lbs = units === 'kg'
          ? Math.round(qty * 2.20462 * 10) / 10
          : Math.round(qty * 10) / 10
      }
      else if (name === 'resting_heart_rate' && qty != null) {
        byDate[dateStr].rhr = Math.round(qty)
      }
      else if (name === 'heart_rate_variability' && qty != null) {
        byDate[dateStr].hrv = Math.round(qty)
      }
      else if (name === 'blood_pressure') {
        if (typeof point.systolic === 'number') byDate[dateStr].bp_systolic = Math.round(point.systolic)
        if (typeof point.diastolic === 'number') byDate[dateStr].bp_diastolic = Math.round(point.diastolic)
      }
      else if (name === 'blood_pressure_systolic' && qty != null) {
        byDate[dateStr].bp_systolic = Math.round(qty)
      }
      else if (name === 'blood_pressure_diastolic' && qty != null) {
        byDate[dateStr].bp_diastolic = Math.round(qty)
      }
    }
  }

  const db = getDb(event)
  const created: string[] = []
  const updated: string[] = []

  for (const [date, vitals] of Object.entries(byDate)) {
    const existing = await db.prepare('SELECT weight_lbs, rhr, hrv, bp_systolic, bp_diastolic FROM journal_entries WHERE date = ?1')
      .bind(date).first<Record<string, number | null>>()

    if (!existing) {
      await db.prepare(`
        INSERT INTO journal_entries (date, peptides, reconstitutions, food, workout, notes, weight_lbs, rhr, hrv, bp_systolic, bp_diastolic)
        VALUES (?1, '[]', '[]', '{}', '', '', ?2, ?3, ?4, ?5, ?6)
      `).bind(
        date,
        vitals.weight_lbs ?? null,
        vitals.rhr ?? null,
        vitals.hrv ?? null,
        vitals.bp_systolic ?? null,
        vitals.bp_diastolic ?? null
      ).run()
      created.push(date)
      continue
    }

    const patch: Partial<Vitals> = {}
    for (const field of VITAL_FIELDS) {
      if (existing[field] == null && vitals[field] != null) patch[field] = vitals[field]
    }
    if (Object.keys(patch).length === 0) continue

    const fields = Object.keys(patch) as Array<keyof Vitals>
    const setClause = fields.map((f, i) => `${f} = ?${i + 2}`).join(', ')
    await db.prepare(`UPDATE journal_entries SET ${setClause} WHERE date = ?1`)
      .bind(date, ...fields.map(f => patch[f]))
      .run()
    updated.push(date)
  }

  return { ok: true, created: created.length, updated: updated.length, dates: [...created, ...updated].sort() }
})
