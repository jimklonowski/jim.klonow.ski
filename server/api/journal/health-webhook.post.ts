interface Vitals {
  weight_lbs?: number
  rhr?: number
  hrv?: number
  bp_systolic?: number
  bp_diastolic?: number
}

interface HealthMetrics {
  vo2_max?: number
  body_fat_pct?: number
  lean_body_mass_lbs?: number
  sleep_total_min?: number
  sleep_rem_min?: number
  sleep_deep_min?: number
  sleep_core_min?: number
  sleep_awake_min?: number
}

interface Workout {
  external_id: string | null
  date: string
  workout_type: string | null
  start_time: string | null
  duration_min: number | null
  calories: number | null
  avg_hr: number | null
  max_hr: number | null
  distance_mi: number | null
}

const VITAL_FIELDS = ['weight_lbs', 'rhr', 'hrv', 'bp_systolic', 'bp_diastolic'] as const

function hoursToMin(qty: number) {
  return Math.round(qty * 60)
}

// Handles both `{ activeEnergyBurned: 450 }` and `{ activeEnergyBurned: { qty: 450 } }` shapes
// that different Health Auto Export versions have used for workout sub-fields.
function numOrQty(v: unknown): number | null {
  if (typeof v === 'number') return v
  if (v && typeof v === 'object' && typeof (v as Record<string, unknown>).qty === 'number') {
    return (v as Record<string, unknown>).qty as number
  }
  return null
}

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization')
  const secret = process.env.LABS_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const body = await readBody(event)
  const metrics: Array<{ name: string, units?: string, data: Array<Record<string, unknown>> }> =
    body?.data?.metrics ?? []
  const workoutsIn: Array<Record<string, unknown>> = body?.data?.workouts ?? []

  const byDate: Record<string, Vitals> = {}
  const healthByDate: Record<string, HealthMetrics> = {}

  for (const metric of metrics) {
    const { name, units, data } = metric
    for (const point of data ?? []) {
      const dateStr = String(point.date ?? '').substring(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue
      if (!byDate[dateStr]) byDate[dateStr] = {}
      if (!healthByDate[dateStr]) healthByDate[dateStr] = {}

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
      else if (name === 'vo2_max' && qty != null) {
        healthByDate[dateStr].vo2_max = Math.round(qty * 10) / 10
      }
      else if (name === 'body_fat_percentage' && qty != null) {
        // Health Auto Export's scale for this metric (fraction like 0.225 vs already-percent
        // like 22.5) needs confirming against a real payload before trusting this value.
        healthByDate[dateStr].body_fat_pct = qty <= 1 ? Math.round(qty * 1000) / 10 : Math.round(qty * 10) / 10
      }
      else if (name === 'lean_body_mass' && qty != null) {
        healthByDate[dateStr].lean_body_mass_lbs = units === 'kg'
          ? Math.round(qty * 2.20462 * 10) / 10
          : Math.round(qty * 10) / 10
      }
      else if (name === 'sleep_analysis') {
        const h = healthByDate[dateStr]
        if (typeof point.rem === 'number') h.sleep_rem_min = hoursToMin(point.rem)
        if (typeof point.deep === 'number') h.sleep_deep_min = hoursToMin(point.deep)
        if (typeof point.core === 'number') h.sleep_core_min = hoursToMin(point.core)
        if (typeof point.awake === 'number') h.sleep_awake_min = hoursToMin(point.awake)
        // Health Auto Export's own `asleep` field on this metric has been unreliable (observed
        // as 0 while rem/deep/core were correct), so derive total time asleep from the stages
        // instead - this matches how HealthKit itself defines "asleep" (rem + core + deep).
        if (h.sleep_rem_min != null || h.sleep_deep_min != null || h.sleep_core_min != null) {
          h.sleep_total_min = (h.sleep_rem_min ?? 0) + (h.sleep_deep_min ?? 0) + (h.sleep_core_min ?? 0)
        }
      }
    }
  }

  const workouts: Workout[] = []
  for (const w of workoutsIn) {
    const start = typeof w.start === 'string' ? w.start : null
    const dateStr = start?.substring(0, 10) ?? null
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue

    const durationSec = typeof w.duration === 'number' ? w.duration : null
    const calories = numOrQty(w.activeEnergyBurned)
    const distance = numOrQty(w.distance)
    const avgHr = numOrQty(w.avgHeartRate) ?? numOrQty(w.heartRateData)
    const maxHr = numOrQty(w.maxHeartRate)

    workouts.push({
      external_id: typeof w.id === 'string' ? w.id : null,
      date: dateStr,
      workout_type: typeof w.name === 'string' ? w.name : null,
      start_time: start,
      duration_min: durationSec != null ? Math.round(durationSec / 6) / 10 : null,
      calories: calories != null ? Math.round(calories) : null,
      avg_hr: avgHr != null ? Math.round(avgHr) : null,
      max_hr: maxHr != null ? Math.round(maxHr) : null,
      distance_mi: distance != null ? Math.round(distance * 10) / 10 : null
    })
  }

  const db = getDb(event)
  const created: string[] = []
  const updated: string[] = []

  for (const [date, vitals] of Object.entries(byDate)) {
    const existing = await db.prepare('SELECT weight_lbs, rhr, hrv, bp_systolic, bp_diastolic FROM journal_entries WHERE date = ?1')
      .bind(date).first<Record<string, number | null>>()

    if (!existing) {
      await db.prepare(`
        INSERT INTO journal_entries (date, peptides, reconstitutions, food, notes, weight_lbs, rhr, hrv, bp_systolic, bp_diastolic)
        VALUES (?1, '[]', '[]', '{}', '', ?2, ?3, ?4, ?5, ?6)
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

  let healthMetricsTouched = 0
  for (const [date, metricsForDate] of Object.entries(healthByDate)) {
    if (await upsertHealthMetrics(db, date, metricsForDate)) healthMetricsTouched++
  }

  for (const w of workouts) {
    await upsertWorkout(db, w)
  }

  return {
    ok: true,
    created: created.length,
    updated: updated.length,
    healthMetrics: healthMetricsTouched,
    workouts: workouts.length,
    dates: [...created, ...updated].sort()
  }
})
